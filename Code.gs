/**************************************************************************************************
 * ViaggiAI — BACKEND (Google Apps Script Web App)
 * --------------------------------------------------------------------------------------------
 * Architettura: GitHub Pages (frontend HTML) ──fetch──> Web App GAS (questo file) ──> Google Sheets
 *
 * FILOSOFIA "REAL-DATA-OR-REAL-LINK":
 *   Ogni servizio (voli, treni, hotel, auto) restituisce SEMPRE almeno un deep link reale di
 *   prenotazione verso il sito ufficiale. Se l'API e' configurata e risponde, aggiunge anche
 *   i dati reali (prezzi/orari). Non viene MAI mostrato nulla di inventato.
 *
 * DATI REALI:
 *   - Voli  : Kiwi Tequila API  -> prezzi reali + deep_link prenotazione (free tier = sandbox/test)
 *   - Hotel : Amadeus Self-Service -> prezzi reali (ambiente "test" = dataset limitato/cache)
 *   - Auto  : OpenRouteService -> distanza/durata reali del percorso + deep link noleggio
 *   - Treni : nessuna API gratuita IT -> deep link reali (Omio universale + operatore)
 *   - POI   : Overpass (OpenStreetMap) -> attrazioni reali
 *   - Meteo : Open-Meteo -> previsioni reali
 *
 * SICUREZZA:
 *   - API key lette da PropertiesService (consigliato) o dal foglio "Config" (compatibilita').
 *   - idToken Google verificato server-side contro Google tokeninfo.
 *   - Cap giornaliero globale per proteggere le quote.
 *
 * DEPLOY (CRITICO):
 *   Deploy > New deployment > Web app
 *     - Execute as: Me (owner)
 *     - Who has access: Anyone
 *   Per AGGIORNARE senza cambiare URL: Deploy > Manage deployments > (matita) > New version.
 *   NON creare ogni volta un "New deployment": cambierebbe l'URL e scollegherebbe il frontend.
 *
 * SETUP RAPIDO:
 *   1) Esegui una volta la funzione setup()  (crea i fogli Config/Users/Trips + intestazioni)
 *   2) Inserisci le chiavi: esegui saveKeysExample() dopo aver messo i tuoi valori,
 *      oppure scrivile a mano nel foglio "Config" (colonna A = chiave, colonna B = valore).
 *   3) Deploy come Web app (vedi sopra) e incolla l'URL nel frontend (BACKEND_URL).
 **************************************************************************************************/

/* ============================================================================================
 * CONFIGURAZIONE
 * ==========================================================================================*/

// Nomi dei fogli
const SHEET_CONFIG       = 'Config';
const SHEET_USERS        = 'Users';
const SHEET_TRIPS        = 'Trips';
const SHEET_ENTITLEMENTS = 'Entitlements';   // ruoli/tier: admin | pro | trial

// Valori di default (sovrascrivibili da Properties o foglio Config)
const DEFAULTS = {
  AMADEUS_ENV: 'test',                 // 'test' (free) | 'production' (a pagamento, dati live completi)
  REQUIRE_LOGIN_FOR_SEARCH: 'true',    // con i tier il login e' SEMPRE obbligatorio
  DAILY_SEARCH_CAP: '800',             // tetto globale ricerche/giorno per proteggere le quote API
  CURRENCY: 'EUR',
  AFFILIATE_KIWI: '',                  // eventuale affiliate id Kiwi (lasciare vuoto se non hai)
  ADMIN_EMAILS: '',                    // email admin separate da virgola (es. tu@gmail.com)
  TRIAL_MAX_TRIPS: '2',                // viaggi pianificabili in versione di prova, poi blocco
};

/**
 * Legge una chiave di configurazione.
 * Priorita': Script Properties -> foglio Config -> DEFAULTS.
 */
function cfg_(key) {
  const props = PropertiesService.getScriptProperties();
  let v = props.getProperty(key);
  if (v !== null && v !== '') return v;

  // fallback al foglio Config (cache 5 minuti)
  const cache = CacheService.getScriptCache();
  let map = cache.get('__cfg__');
  if (map) {
    map = JSON.parse(map);
    if (map[key] !== undefined && map[key] !== '') return map[key];
  } else {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
    if (sh) {
      const rows = sh.getDataRange().getValues();
      const m = {};
      rows.forEach(r => { if (r[0]) m[String(r[0]).trim()] = String(r[1]).trim(); });
      cache.put('__cfg__', JSON.stringify(m), 300);
      if (m[key] !== undefined && m[key] !== '') return m[key];
    }
  }
  return DEFAULTS[key] !== undefined ? DEFAULTS[key] : '';
}

/* ============================================================================================
 * ENTRY POINTS HTTP
 * ==========================================================================================*/

/** Health-check / debug via GET (utile per verificare che il deploy sia vivo). */
function doGet(e) {
  return jsonOut_({ success: true, service: 'ViaggiAI backend', time: new Date().toISOString() });
}

/**
 * Router principale. Il frontend invia POST con body JSON (Content-Type text/plain per evitare
 * il preflight CORS: Google Apps Script NON gestisce le richieste OPTIONS).
 */
function doPost(e) {
  const t0 = Date.now();
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut_({ success: false, error: 'Richiesta vuota' });
    }
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    switch (action) {
      case 'login':           return handleLogin_(payload);
      case 'search':          return handleSearch_(payload, t0);
      case 'saveTrip':        return handleSaveTrip_(payload);
      case 'getHistory':      return handleGetHistory_(payload);
      case 'adminListUsers':     return handleAdminListUsers_(payload);
      case 'adminSetTier':       return handleAdminSetTier_(payload);
      case 'adminCreateUser':    return handleAdminCreateUser_(payload);
      case 'adminBlockUser':     return handleAdminBlock_(payload, true);
      case 'adminUnblockUser':   return handleAdminBlock_(payload, false);
      case 'adminUpdateUser':    return handleAdminUpdateUser_(payload);
      default:                return jsonOut_({ success: false, error: 'Azione sconosciuta: ' + action });
    }
  } catch (err) {
    return jsonOut_({ success: false, error: 'Errore server: ' + (err && err.message ? err.message : err) });
  }
}

/** Helper risposta JSON. NB: GAS non permette di impostare header CORS;
 *  funziona perche' la risposta finale passa da googleusercontent.com con Access-Control-Allow-Origin:* */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================================================
 * AUTENTICAZIONE
 * ==========================================================================================*/

/** Verifica il JWT idToken di Google Identity Services. Ritorna {email,name,sub} oppure null. */
function verifyIdToken_(idToken) {
  if (!idToken) return null;
  try {
    const resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;
    const p = JSON.parse(resp.getContentText());

    const clientId = cfg_('GOOGLE_CLIENT_ID');
    if (!clientId) return null;                                      // FAIL-CLOSED: senza Client ID si rifiuta tutto
    if (p.aud !== clientId) return null;                            // token destinato ad altra app
    if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') return null;
    if (p.exp && (Number(p.exp) * 1000) < Date.now()) return null;   // scaduto
    if (p.email_verified === false || p.email_verified === 'false') return null; // email non verificata

    return { email: p.email, name: p.name || p.email, sub: p.sub, picture: p.picture || '' };
  } catch (err) {
    return null;
  }
}

function handleLogin_(payload) {
  const u = verifyIdToken_(payload.idToken);
  if (!u) return jsonOut_({ success: false, error: 'Token non valido o scaduto' });
  upsertUser_(u);
  const ent = getEntitlement_(u.email);
  if (ent.status === 'blocked') {
    return jsonOut_({ success: false, error: "Account bloccato. Contatta l'amministratore." });
  }
  if (ent.expiryDate) {
    const exp = new Date(ent.expiryDate);
    if (!isNaN(exp.getTime()) && exp < new Date()) {
      return jsonOut_({ success: false, error: 'Account scaduto il ' + exp.toLocaleDateString("it-IT") + ". Contatta l'amministratore." });
    }
  }
  const max = ent.tripsMax || parseInt(cfg_('TRIAL_MAX_TRIPS') || '2', 10);
  return jsonOut_({
    success: true,
    user: { email: u.email, name: u.name, picture: u.picture },
    tier: ent.tier, tripsUsed: ent.tripsUsed, tripsMax: max, status: ent.status,
    expiryDate: ent.expiryDate || null
  });
}

function upsertUser_(u) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_USERS, ['email', 'name', 'sub', 'firstSeen', 'lastSeen']);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === u.email) {
        sh.getRange(i + 1, 5).setValue(new Date());
        return;
      }
    }
    sh.appendRow([u.email, u.name, u.sub, new Date(), new Date()]);
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================================
 * RICERCA VIAGGIO (orchestratore)
 * ==========================================================================================*/

function handleSearch_(payload, t0) {
  // Login OBBLIGATORIO (necessario per i tier). Verifica server-side dell'idToken.
  const u = verifyIdToken_(payload.idToken);
  if (!u) return jsonOut_({ success: false, error: 'Accedi con Google per cercare.' });

  const ent = getEntitlement_(u.email);
  const trialMax = parseInt(cfg_('TRIAL_MAX_TRIPS') || '2', 10);

  // NB: il blocco Trial e il cap globale sono applicati piu' sotto, SOLO per ricerche reali
  //     (con destinazione), in modo atomico. I suggerimenti a destinazione vuota sono gratuiti.

  const warnings = [];
  const originRaw = (payload.origin || '').trim();
  const destRaw   = (payload.destination || '').trim();
  const dateFrom  = payload.dateFrom; // yyyy-mm-dd dal frontend
  const dateTo    = payload.dateTo;
  const adults    = Math.max(1, parseInt(payload.adults || '1', 10));
  const prefTransport = payload.preferTransport || '';
  const prefLodging   = payload.preferLodging || '';

  if (!originRaw || !dateFrom || !dateTo) {
    return jsonOut_({ success: false, error: 'Origine e date sono obbligatorie.' });
  }

  // Se la destinazione e' vuota -> MVP: niente "destinazioni inventate".
  // Ritorniamo suggerimenti curati con deep link reali. NON consumano il Trial.
  if (!destRaw) {
    return jsonOut_({
      success: true,
      results: suggestDestinations_(originRaw, dateFrom, dateTo, adults),
      warnings: ['Nessuna destinazione inserita: ti mostro alcune mete popolari con link di ricerca reali. Indica una destinazione per dati prezzo/orario dettagliati.'],
      tier: ent.tier, tripsUsed: ent.tripsUsed, tripsMax: trialMax,
      meta: { tempoMs: Date.now() - t0 }
    });
  }

  // Ricerca REALE (con destinazione): cap globale + consumo Trial atomico PRIMA del lavoro costoso.
  if (!underDailyCap_()) {
    return jsonOut_({ success: false, error: 'Limite giornaliero di ricerche raggiunto. Riprova domani.' });
  }
  let trialTripsUsed = ent.tripsUsed;
  if (ent.tier === 'trial') {
    const consume = consumeTrialTrip_(u.email, trialMax);
    if (!consume.allowed) {
      return jsonOut_({
        success: false, blocked: true, tier: 'trial',
        error: 'Versione di prova terminata: hai usato i ' + trialMax + ' viaggi gratuiti. Passa a Pro per continuare.'
      });
    }
    trialTripsUsed = consume.tripsUsed;
  }

  const origin = extractCity_(originRaw);
  const dest   = extractCity_(destRaw);

  // Geocoding destinazione (per meteo, POI, mappa, percorso auto)
  const geoDest   = geocode_(dest);
  const geoOrigin = geocode_(origin);

  // --- VOLI ---
  let voli = [], voliError = null;
  try {
    voli = searchFlights_(origin, dest, dateFrom, dateTo, adults);
  } catch (err) { voliError = err.message; }
  const voliLinkFallback = flightSearchLink_(origin, dest, dateFrom, dateTo, adults);

  // --- TRENI (deep link reali; nessuna API gratuita per prezzi IT) ---
  const treni = buildTrainOptions_(originRaw, destRaw, origin, dest, dateFrom);

  // --- HOTEL ---
  let hotels = [], hotelsError = null;
  try {
    hotels = searchHotels_(dest, dateFrom, dateTo, adults);
  } catch (err) { hotelsError = err.message; }
  const hotelLinkFallback = bookingLink_(dest, dateFrom, dateTo, adults);

  // --- AUTO (percorso reale via ORS + deep link noleggio) ---
  let auto = null;
  try {
    auto = buildCarOption_(geoOrigin, geoDest, origin, dest, dateFrom, dateTo);
  } catch (err) { /* non bloccante */ }

  // --- POI ---
  let pois = [], poisError = null;
  try {
    if (geoDest) pois = searchPOI_(geoDest.lat, geoDest.lon);
  } catch (err) { poisError = err.message; }

  // --- METEO ---
  let meteo = null;
  try {
    if (geoDest) meteo = getWeather_(geoDest.lat, geoDest.lon, dateFrom, dateTo);
  } catch (err) { /* non bloccante */ }

  // Stima costo (somma del piu' economico disponibile, solo dati reali)
  const giorni = diffDays_(dateFrom, dateTo) || 1;
  let costoStimato = null;
  const minVolo  = voli.length  ? Math.min.apply(null, voli.map(v => v.prezzo).filter(isFinite)) : null;
  const minHotel = hotels.length ? Math.min.apply(null, hotels.map(h => h.prezzoTotale).filter(isFinite)) : null;
  if (minVolo != null || minHotel != null) {
    costoStimato = (minVolo || 0) * adults + (minHotel || 0);
  }

  const result = {
    destinazione: capitalize_(dest),
    origine: capitalize_(origin),
    lat: geoDest ? geoDest.lat : null,
    lon: geoDest ? geoDest.lon : null,
    giorni: giorni,
    costoTotaleStimato: costoStimato,
    meteo: meteo,

    voli: voli,
    voliError: voliError,
    voliLink: voliLinkFallback,
    voliNota: voli.length ? null : 'Prezzi live non disponibili (API in approvazione o nessun risultato): usa il link di ricerca.',

    treni: treni,
    treniNota: 'Per Trenitalia/Italo non esiste API pubblica: i prezzi/orari reali sono sul sito di prenotazione (link sotto).',

    hotels: hotels,
    hotelsError: hotelsError,
    hotelLink: hotelLinkFallback,
    hotelsNota: (cfg_('AMADEUS_ENV') === 'test' && hotels.length)
      ? 'Prezzi da ambiente Amadeus "test" (dataset limitato): verifica sempre sul sito di prenotazione.'
      : (hotels.length ? null : 'Prezzi live non disponibili: usa il link di ricerca.'),

    auto: auto,

    pois: pois,
    poisError: poisError,

    preferenze: { transport: prefTransport, lodging: prefLodging }
  };

  // Il viaggio Trial e' gia' stato consumato atomicamente prima della ricerca.
  return jsonOut_({
    success: true, results: [result], warnings: warnings,
    tier: ent.tier, tripsUsed: trialTripsUsed, tripsMax: trialMax,
    meta: { tempoMs: Date.now() - t0 }
  });
}

/* ============================================================================================
 * VOLI — Kiwi Tequila
 * ==========================================================================================*/

function searchFlights_(originCity, destCity, dateFrom, dateTo, adults) {
  const key = cfg_('KIWI_API_KEY');
  if (!key) return []; // nessuna chiave -> il frontend usera' il deep link di fallback

  const fromCode = kiwiLocationCode_(originCity, key);
  const toCode   = kiwiLocationCode_(destCity, key);
  if (!fromCode || !toCode) return [];

  const df = toKiwiDate_(dateFrom);
  const dt = toKiwiDate_(dateFrom); // ricerca andata sul giorno di partenza
  const url = 'https://api.tequila.kiwi.com/v2/search'
    + '?fly_from=' + encodeURIComponent(fromCode)
    + '&fly_to=' + encodeURIComponent(toCode)
    + '&date_from=' + df + '&date_to=' + dt
    + '&adults=' + adults
    + '&curr=' + cfg_('CURRENCY')
    + '&sort=price&limit=5&vehicle_type=aircraft';

  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'apikey': key, 'accept': 'application/json' },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Kiwi HTTP ' + resp.getResponseCode());
  }
  const data = JSON.parse(resp.getContentText());
  if (!data.data) return [];

  return data.data.slice(0, 5).map(f => ({
    compagnia: (f.airlines || []).join(', ') || 'N/D',
    partenza: f.local_departure,
    arrivo: f.local_arrival,
    prezzo: f.price,
    valuta: cfg_('CURRENCY'),
    scali: Array.isArray(f.route) ? Math.max(0, f.route.length - 1) : 0,
    durata: f.duration ? Math.round(f.duration.total / 60) + ' min' : '',
    link: f.deep_link || ''
  }));
}

/** Risolve "Milano" -> codice citta' Kiwi (IATA). Con cache 24h. */
function kiwiLocationCode_(term, key) {
  if (!term) return '';
  const cache = CacheService.getScriptCache();
  const ck = 'kiwi_loc_' + term.toLowerCase();
  const hit = cache.get(ck);
  if (hit) return hit;

  const url = 'https://api.tequila.kiwi.com/locations/query?term=' + encodeURIComponent(term)
    + '&location_types=city&limit=1&active_only=true';
  const resp = UrlFetchApp.fetch(url, { headers: { 'apikey': key }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return '';
  const data = JSON.parse(resp.getContentText());
  const code = (data.locations && data.locations[0]) ? data.locations[0].code : '';
  if (code) cache.put(ck, code, 86400);
  return code;
}

/* ============================================================================================
 * HOTEL — Amadeus Self-Service
 * ==========================================================================================*/

function amadeusBase_() {
  return cfg_('AMADEUS_ENV') === 'production'
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com';
}

/** Bearer token OAuth2 client_credentials, cache ~25 min. */
function amadeusToken_() {
  const id = cfg_('AMADEUS_CLIENT_ID');
  const secret = cfg_('AMADEUS_CLIENT_SECRET');
  if (!id || !secret) return '';

  const cache = CacheService.getScriptCache();
  const hit = cache.get('amadeus_token');
  if (hit) return hit;

  const resp = UrlFetchApp.fetch(amadeusBase_() + '/v1/security/oauth2/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'client_credentials', client_id: id, client_secret: secret },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Amadeus auth HTTP ' + resp.getResponseCode());
  const data = JSON.parse(resp.getContentText());
  cache.put('amadeus_token', data.access_token, Math.min(1500, (data.expires_in || 1800) - 60));
  return data.access_token;
}

/** Citta' -> cityCode IATA (es. Paris -> PAR). Cache 24h. */
function amadeusCityCode_(city, token) {
  const cache = CacheService.getScriptCache();
  const ck = 'amad_city_' + city.toLowerCase();
  const hit = cache.get(ck);
  if (hit) return hit;

  const url = amadeusBase_() + '/v1/reference-data/locations?subType=CITY&keyword='
    + encodeURIComponent(city) + '&page%5Blimit%5D=1';
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) return '';
  const data = JSON.parse(resp.getContentText());
  const code = (data.data && data.data[0]) ? (data.data[0].iataCode || data.data[0].address && data.data[0].address.cityCode) : '';
  if (code) cache.put(ck, code, 86400);
  return code || '';
}

function searchHotels_(city, checkIn, checkOut, adults) {
  const token = amadeusToken_();
  if (!token) return [];

  const cityCode = amadeusCityCode_(city, token);
  if (!cityCode) return [];

  // 1) hotel per citta'
  const listUrl = amadeusBase_() + '/v1/reference-data/locations/hotels/by-city?cityCode=' + cityCode;
  const listResp = UrlFetchApp.fetch(listUrl, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (listResp.getResponseCode() !== 200) throw new Error('Amadeus hotels-by-city HTTP ' + listResp.getResponseCode());
  const listData = JSON.parse(listResp.getContentText());
  if (!listData.data || !listData.data.length) return [];

  const hotelIds = listData.data.slice(0, 20).map(h => h.hotelId).join(',');

  // 2) offerte/prezzi
  const offUrl = amadeusBase_() + '/v3/shopping/hotel-offers'
    + '?hotelIds=' + hotelIds
    + '&checkInDate=' + checkIn + '&checkOutDate=' + checkOut
    + '&adults=' + adults + '&roomQuantity=1&bestRateOnly=true&currency=' + cfg_('CURRENCY');
  const offResp = UrlFetchApp.fetch(offUrl, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (offResp.getResponseCode() !== 200) {
    // capita spesso in "test" (no offerte per quelle date): ritorna [] -> il frontend usa il deep link
    return [];
  }
  const offData = JSON.parse(offResp.getContentText());
  if (!offData.data) return [];

  return offData.data.slice(0, 6).map(item => {
    const offer = (item.offers && item.offers[0]) || {};
    return {
      nome: item.hotel ? item.hotel.name : 'Hotel',
      stelle: item.hotel && item.hotel.rating ? item.hotel.rating : null,
      prezzoTotale: offer.price ? Number(offer.price.total) : null,
      valuta: offer.price ? offer.price.currency : cfg_('CURRENCY'),
      link: bookingLink_(city, checkIn, checkOut, adults) // Amadeus test non da' link prenotabili: usiamo Booking
    };
  });
}

/* ============================================================================================
 * TRENI — deep link reali (Omio universale + operatore per paese)
 * ==========================================================================================*/

function buildTrainOptions_(originRaw, destRaw, originCity, destCity, date) {
  const opts = [];

  // Link universale Omio: copre Trenitalia, Italo, DB, SNCF, ecc. con prezzi reali sul loro sito
  opts.push({
    operatore: 'Omio (tutti gli operatori)',
    nota: 'Confronta Trenitalia, Italo, DB, SNCF in una ricerca',
    link: 'https://www.omio.com/search-frontend/results/'
      + encodeURIComponent(originCity) + '/' + encodeURIComponent(destCity)
      + '?departureDate=' + (date || '')
  });

  // Operatore in base al paese dell'origine (best-effort)
  const country = guessCountry_(originRaw);
  if (country === 'IT' || country === '') {
    opts.push({
      operatore: 'Trenitalia',
      link: 'https://www.trenitalia.com/'
    });
    opts.push({
      operatore: 'Italo',
      link: 'https://www.italotreno.com/it'
    });
  }
  if (country === 'DE') {
    opts.push({ operatore: 'Deutsche Bahn', link: 'https://www.bahn.com/en' });
  }
  if (country === 'FR') {
    opts.push({ operatore: 'SNCF Connect', link: 'https://www.sncf-connect.com/en-en/' });
  }
  return opts;
}

/* ============================================================================================
 * AUTO — percorso reale (OpenRouteService) + deep link noleggio
 * ==========================================================================================*/

function buildCarOption_(geoOrigin, geoDest, originCity, destCity, dateFrom, dateTo) {
  const out = {
    distanzaKm: null,
    durataMin: null,
    percorsoNota: null,
    noleggio: {
      rentalcars: rentalcarsLink_(destCity, dateFrom, dateTo),
      kayak: kayakCarsLink_(destCity, dateFrom, dateTo)
    }
  };

  const key = cfg_('ORS_API_KEY');
  if (key && geoOrigin && geoDest) {
    try {
      const url = 'https://api.openrouteservice.org/v2/directions/driving-car';
      const body = { coordinates: [[geoOrigin.lon, geoOrigin.lat], [geoDest.lon, geoDest.lat]] };
      const resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: key },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() === 200) {
        const data = JSON.parse(resp.getContentText());
        const seg = data.routes && data.routes[0] && data.routes[0].summary;
        if (seg) {
          out.distanzaKm = Math.round(seg.distance / 1000);
          out.durataMin = Math.round(seg.duration / 60);
        }
      }
    } catch (err) { /* non bloccante */ }
  }
  return out;
}

/* ============================================================================================
 * POI — Overpass (OpenStreetMap)
 * ==========================================================================================*/

function searchPOI_(lat, lon) {
  const radius = 4000; // metri
  const ql = '[out:json][timeout:15];('
    + 'node["tourism"="attraction"](around:' + radius + ',' + lat + ',' + lon + ');'
    + 'node["tourism"="museum"](around:' + radius + ',' + lat + ',' + lon + ');'
    + 'node["historic"](around:' + radius + ',' + lat + ',' + lon + ');'
    + ');out body 15;';
  const resp = UrlFetchApp.fetch('https://overpass-api.de/api/interpreter', {
    method: 'post',
    payload: ql,
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Overpass HTTP ' + resp.getResponseCode());
  const data = JSON.parse(resp.getContentText());
  if (!data.elements) return [];
  return data.elements
    .filter(el => el.tags && el.tags.name)
    .slice(0, 12)
    .map(el => ({
      nome: el.tags.name,
      tipo: el.tags.tourism || el.tags.historic || 'POI',
      lat: el.lat,
      lon: el.lon
    }));
}

/* ============================================================================================
 * METEO — Open-Meteo
 * ==========================================================================================*/

function getWeather_(lat, lon, dateFrom, dateTo) {
  // Open-Meteo: previsioni fino a ~16 giorni. Oltre, ritorna null senza errore.
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon
    + '&daily=temperature_2m_max,temperature_2m_min,weathercode'
    + '&start_date=' + dateFrom + '&end_date=' + dateTo + '&timezone=auto';
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  const d = JSON.parse(resp.getContentText());
  if (!d.daily || !d.daily.time || !d.daily.time.length) return null;
  const maxArr = d.daily.temperature_2m_max, minArr = d.daily.temperature_2m_min;
  return {
    tempMax: Math.round(Math.max.apply(null, maxArr)),
    tempMin: Math.round(Math.min.apply(null, minArr)),
    descrizione: weatherCodeDesc_(d.daily.weathercode ? d.daily.weathercode[0] : null)
  };
}

function weatherCodeDesc_(code) {
  if (code == null) return '';
  if (code === 0) return 'Sereno';
  if (code <= 3) return 'Parzialmente nuvoloso';
  if (code <= 48) return 'Nebbia';
  if (code <= 67) return 'Pioggia';
  if (code <= 77) return 'Neve';
  if (code <= 82) return 'Rovesci';
  return 'Variabile';
}

/* ============================================================================================
 * GEOCODING — OpenRouteService (Pelias), riusa la chiave ORS. Cache 24h.
 * ==========================================================================================*/

function geocode_(city) {
  if (!city) return null;
  const cache = CacheService.getScriptCache();
  const ck = 'geo_' + city.toLowerCase();
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);

  const key = cfg_('ORS_API_KEY');
  let result = null;

  if (key) {
    const url = 'https://api.openrouteservice.org/geocode/search?api_key=' + key
      + '&text=' + encodeURIComponent(city) + '&size=1';
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const d = JSON.parse(resp.getContentText());
      if (d.features && d.features[0]) {
        const c = d.features[0].geometry.coordinates;
        result = { lon: c[0], lat: c[1], country: (d.features[0].properties || {}).country_a || '' };
      }
    }
  }

  // Fallback: Nominatim (OSM) con User-Agent obbligatorio
  if (!result) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(city);
    const resp = UrlFetchApp.fetch(url, {
      headers: { 'User-Agent': 'ViaggiAI/1.0 (contatto: tuo-email@example.com)' },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      const arr = JSON.parse(resp.getContentText());
      if (arr && arr[0]) result = { lat: Number(arr[0].lat), lon: Number(arr[0].lon), country: '' };
    }
  }

  if (result) cache.put(ck, JSON.stringify(result), 86400);
  return result;
}

/* ============================================================================================
 * DEEP LINK BUILDERS (fallback "real link")
 * ==========================================================================================*/

function flightSearchLink_(origin, dest, dateFrom, dateTo, adults) {
  // Kiwi search page precompilata (robusta). In alternativa Google Flights.
  return 'https://www.kiwi.com/en/search/results/'
    + encodeURIComponent(origin) + '/' + encodeURIComponent(dest)
    + '/' + (dateFrom || '') + '/' + (dateTo || '');
}

function bookingLink_(city, checkIn, checkOut, adults) {
  return 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(city)
    + '&checkin=' + (checkIn || '') + '&checkout=' + (checkOut || '')
    + '&group_adults=' + (adults || 1);
}

function rentalcarsLink_(city, dateFrom, dateTo) {
  return 'https://www.rentalcars.com/SearchResults.do?location=' + encodeURIComponent(city);
}

function kayakCarsLink_(city, dateFrom, dateTo) {
  return 'https://www.kayak.com/cars/' + encodeURIComponent(city) + '/' + (dateFrom || '') + '/' + (dateTo || '');
}

/* ============================================================================================
 * SUGGERIMENTI (destinazione vuota) — mete curate + link reali, nessun dato inventato
 * ==========================================================================================*/

function suggestDestinations_(originRaw, dateFrom, dateTo, adults) {
  const origin = extractCity_(originRaw);
  const mete = ['Parigi', 'Barcellona', 'Amsterdam', 'Praga', 'Lisbona'];
  return mete.map(m => ({
    destinazione: m,
    origine: capitalize_(origin),
    suggerimento: true,
    voli: [], hotels: [], pois: [], treni: [],
    voliLink: flightSearchLink_(origin, m, dateFrom, dateTo, adults),
    hotelLink: bookingLink_(m, dateFrom, dateTo, adults),
    voliNota: 'Suggerimento: clicca per vedere voli reali verso ' + m + '.'
  }));
}

/* ============================================================================================
 * SALVATAGGIO / STORICO (Google Sheets)
 * ==========================================================================================*/

function handleSaveTrip_(payload) {
  const u = verifyIdToken_(payload.idToken);
  if (!u) return jsonOut_({ success: false, error: 'Accedi prima di salvare.' });

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_TRIPS,
      ['email', 'origine', 'destinazioni', 'dataFrom', 'dataTo', 'budget', 'costoTotale', 'salvatoIl']);
    sh.appendRow([
      u.email,
      payload.origin || '',
      (payload.destinations || []).join(', '),
      payload.dates ? payload.dates.from : '',
      payload.dates ? payload.dates.to : '',
      payload.budget || '',
      payload.totalCost || '',
      new Date()
    ]);
    return jsonOut_({ success: true });
  } finally {
    lock.releaseLock();
  }
}

function handleGetHistory_(payload) {
  const u = verifyIdToken_(payload.idToken);
  if (!u) return jsonOut_({ success: false, error: 'Accedi per vedere lo storico.' });

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRIPS);
  if (!sh) return jsonOut_({ success: true, history: [] });

  const data = sh.getDataRange().getValues();
  const history = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === u.email) {
      history.push({
        origine: data[i][1],
        destinazioni: String(data[i][2]).split(',').map(s => s.trim()).filter(Boolean),
        costoTotale: data[i][6],
        data: data[i][7]
      });
    }
    if (history.length >= 20) break;
  }
  return jsonOut_({ success: true, history: history });
}

/* ============================================================================================
 * ENTITLEMENT / TIER (Admin | Pro | Trial)
 * ==========================================================================================*/

function isAdminEmail_(email) {
  const admins = (cfg_('ADMIN_EMAILS') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return admins.indexOf(String(email || '').toLowerCase()) !== -1;
}

/**
 * Ritorna {row, email, tier, tripsUsed, status}. Crea la riga al primo accesso (tier=trial,
 * oppure admin se l'email e' in ADMIN_EMAILS). Promuove ad admin se serve.
 */
function getEntitlement_(email) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_ENTITLEMENTS,
      ['email', 'tier', 'tripsUsed', 'status', 'createdAt', 'updatedAt', 'note', 'expiryDate', 'createdBy', 'tripsMax', 'blocked']);
    const data = sh.getDataRange().getValues();
    const admin = isAdminEmail_(email);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === String(email).toLowerCase()) {
        let tier = data[i][1] || 'trial';
        if (admin && tier !== 'admin') { sh.getRange(i + 1, 2).setValue('admin'); tier = 'admin'; }
        const blocked = data[i][10] === true || data[i][10] === 'TRUE';
        return { row: i + 1, email: email, tier: tier,
          tripsUsed: Number(data[i][2] || 0),
          status: blocked ? 'blocked' : (data[i][3] || 'active'),
          expiryDate: data[i][7] || null, createdBy: data[i][8] || null,
          tripsMax: data[i][9] ? Number(data[i][9]) : null, blocked: blocked };
      }
    }
    const tier = admin ? 'admin' : 'trial';
    sh.appendRow([email, tier, 0, 'active', new Date(), new Date(), '', '', '', '', false]);
    return { row: sh.getLastRow(), email: email, tier: tier, tripsUsed: 0, status: 'active',
             expiryDate: null, createdBy: null, tripsMax: null, blocked: false };
  } finally {
    lock.releaseLock();
  }
}

/** Atomico: verifica E consuma un viaggio del Trial sotto un UNICO lock (no race condition).
 *  Ritorna {allowed, blocked, tripsUsed}. Blocca al raggiungimento del limite. */
function consumeTrialTrip_(email, max) {
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ENTITLEMENTS);
    if (!sh) return { allowed: true, tripsUsed: 0 };
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === String(email).toLowerCase()) {
        const tier = data[i][1] || 'trial';
        if (tier !== 'trial') return { allowed: true, tripsUsed: Number(data[i][2] || 0) }; // pro/admin non consumano
        let used = Number(data[i][2] || 0);
        const status = data[i][3] || 'active';
        if (status === 'blocked' || used >= max) return { allowed: false, blocked: true, tripsUsed: used };
        used += 1;
        sh.getRange(i + 1, 3).setValue(used);
        if (used >= max) sh.getRange(i + 1, 4).setValue('blocked');
        sh.getRange(i + 1, 6).setValue(new Date());
        return { allowed: true, tripsUsed: used };
      }
    }
    return { allowed: true, tripsUsed: 0 };
  } finally {
    lock.releaseLock();
  }
}

/** Ritorna l'utente solo se e' admin verificato, altrimenti null. */
function requireAdmin_(payload) {
  const u = verifyIdToken_(payload.idToken);
  if (!u) return null;
  const ent = getEntitlement_(u.email);
  return ent.tier === 'admin' ? u : null;
}

function handleAdminListUsers_(payload) {
  if (!requireAdmin_(payload)) return jsonOut_({ success: false, error: 'Accesso negato (solo Admin).' });
  const sh = getOrCreateSheet_(SHEET_ENTITLEMENTS,
    ['email', 'tier', 'tripsUsed', 'status', 'createdAt', 'updatedAt', 'note', 'expiryDate', 'createdBy', 'tripsMax', 'blocked']);
  const data = sh.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const blocked = data[i][10] === true || data[i][10] === 'TRUE';
    users.push({ email: data[i][0], tier: data[i][1] || 'trial',
      tripsUsed: Number(data[i][2] || 0),
      status: blocked ? 'blocked' : (data[i][3] || 'active'),
      createdAt: data[i][4] ? Utilities.formatDate(new Date(data[i][4]), 'Europe/Rome', 'dd/MM/yyyy') : '',
      updatedAt: data[i][5] ? Utilities.formatDate(new Date(data[i][5]), 'Europe/Rome', 'dd/MM/yyyy') : '',
      note: data[i][6] || '', expiryDate: data[i][7] ? Utilities.formatDate(new Date(data[i][7]), 'Europe/Rome', 'dd/MM/yyyy') : null,
      createdBy: data[i][8] || '', tripsMax: data[i][9] ? Number(data[i][9]) : null, blocked: blocked });
  }
  return jsonOut_({ success: true, users: users });
}

function handleAdminCreateUser_(payload) {
  const caller = requireAdmin_(payload);
  if (!caller) return jsonOut_({ success: false, error: 'Accesso negato (solo Admin).' });
  const targetEmail = String(payload.targetEmail || '').toLowerCase().trim();
  if (!targetEmail || !targetEmail.includes('@')) return jsonOut_({ success: false, error: 'Email non valida.' });
  const newTier = ['trial','pro','admin'].includes(payload.newTier) ? payload.newTier : 'trial';
  const note = payload.note || '';
  const tripsMax = payload.tripsMax ? Number(payload.tripsMax) : '';
  let expiryDate = '';
  if (payload.expiryDays && Number(payload.expiryDays) > 0) {
    expiryDate = new Date(Date.now() + Number(payload.expiryDays) * 86400000).toISOString();
  } else if (payload.expiryDate) { expiryDate = payload.expiryDate; }
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_ENTITLEMENTS,
      ['email','tier','tripsUsed','status','createdAt','updatedAt','note','expiryDate','createdBy','tripsMax','blocked']);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === targetEmail)
        return jsonOut_({ success: false, error: 'Utente già esistente.' });
    }
    sh.appendRow([targetEmail, newTier, 0, 'active', new Date(), new Date(), note, expiryDate, caller.email, tripsMax, false]);
    return jsonOut_({ success: true, email: targetEmail, tier: newTier });
  } finally { lock.releaseLock(); }
}

function handleAdminBlock_(payload, block) {
  if (!requireAdmin_(payload)) return jsonOut_({ success: false, error: 'Accesso negato (solo Admin).' });
  const targetEmail = String(payload.targetEmail || '').toLowerCase().trim();
  if (!targetEmail) return jsonOut_({ success: false, error: 'targetEmail mancante.' });
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_ENTITLEMENTS,
      ['email','tier','tripsUsed','status','createdAt','updatedAt','note','expiryDate','createdBy','tripsMax','blocked']);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === targetEmail) {
        sh.getRange(i+1,11).setValue(block);
        sh.getRange(i+1,4).setValue(block ? 'blocked' : 'active');
        sh.getRange(i+1,6).setValue(new Date());
        return jsonOut_({ success: true, email: targetEmail, blocked: block });
      }
    }
    return jsonOut_({ success: false, error: 'Utente non trovato.' });
  } finally { lock.releaseLock(); }
}

function handleAdminUpdateUser_(payload) {
  if (!requireAdmin_(payload)) return jsonOut_({ success: false, error: 'Accesso negato (solo Admin).' });
  const targetEmail = String(payload.targetEmail || '').toLowerCase().trim();
  if (!targetEmail) return jsonOut_({ success: false, error: 'targetEmail mancante.' });
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_ENTITLEMENTS,
      ['email','tier','tripsUsed','status','createdAt','updatedAt','note','expiryDate','createdBy','tripsMax','blocked']);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === targetEmail) {
        if (payload.note !== undefined) sh.getRange(i+1,7).setValue(payload.note);
        if (payload.expiryDate !== undefined) sh.getRange(i+1,8).setValue(payload.expiryDate);
        if (payload.tripsMax !== undefined) sh.getRange(i+1,10).setValue(payload.tripsMax);
        sh.getRange(i+1,6).setValue(new Date());
        return jsonOut_({ success: true });
      }
    }
    return jsonOut_({ success: false, error: 'Utente non trovato.' });
  } finally { lock.releaseLock(); }
}

/** Admin imposta il tier di un utente (upgrade a Pro, ecc.). Sblocca e azzera il contatore se non-trial. */
function handleAdminSetTier_(payload) {
  if (!requireAdmin_(payload)) return jsonOut_({ success: false, error: 'Accesso negato (solo Admin).' });
  const targetEmail = String(payload.targetEmail || '').trim();
  const newTier = String(payload.newTier || '').trim();
  if (!targetEmail || ['trial', 'pro', 'admin'].indexOf(newTier) === -1) {
    return jsonOut_({ success: false, error: 'Parametri non validi.' });
  }
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_ENTITLEMENTS,
      ['email', 'tier', 'tripsUsed', 'status', 'createdAt', 'updatedAt', 'note', 'expiryDate', 'createdBy', 'tripsMax', 'blocked']);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === targetEmail.toLowerCase()) {
        sh.getRange(i + 1, 2).setValue(newTier);
        sh.getRange(i + 1, 4).setValue('active');
        if (newTier !== 'trial') sh.getRange(i + 1, 3).setValue(0);
        sh.getRange(i + 1, 6).setValue(new Date());
        return jsonOut_({ success: true });
      }
    }
    sh.appendRow([targetEmail, newTier, 0, 'active', new Date(), new Date(), 'creato da admin', '', '', '', false]);
    return jsonOut_({ success: true });
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================================
 * ANTI-ABUSO — tetto giornaliero globale (protegge le tue quote API)
 * ==========================================================================================*/

function underDailyCap_() {
  const cap = parseInt(cfg_('DAILY_SEARCH_CAP') || '0', 10);
  if (!cap) return true;
  const today = Utilities.formatDate(new Date(), 'GMT', 'yyyyMMdd');
  const props = PropertiesService.getScriptProperties();
  const ck = 'searches_' + today;
  let n = parseInt(props.getProperty(ck) || '0', 10);
  if (n >= cap) return false;
  props.setProperty(ck, String(n + 1));
  return true;
}

/* ============================================================================================
 * UTILITY
 * ==========================================================================================*/

function extractCity_(text) {
  if (!text) return '';
  return String(text).split(',')[0].trim();
}

function toKiwiDate_(yyyy_mm_dd) {
  // 'yyyy-mm-dd' -> 'dd/mm/yyyy' (formato Kiwi)
  const p = String(yyyy_mm_dd).split('-');
  if (p.length !== 3) return yyyy_mm_dd;
  return p[2] + '/' + p[1] + '/' + p[0];
}

function diffDays_(from, to) {
  if (!from || !to) return null;
  const a = new Date(from), b = new Date(to);
  return Math.max(1, Math.round((b - a) / 86400000));
}

function capitalize_(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function guessCountry_(raw) {
  const t = (raw || '').toLowerCase();
  if (/italia|italy/.test(t)) return 'IT';
  if (/germania|germany|deutschland/.test(t)) return 'DE';
  if (/francia|france/.test(t)) return 'FR';
  if (/spagna|spain/.test(t)) return 'ES';
  return '';
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) sh.appendRow(headers);
  }
  return sh;
}

/* ============================================================================================
 * SETUP (eseguire UNA volta dall'editor)
 * ==========================================================================================*/

function setup() {
  getOrCreateSheet_(SHEET_CONFIG, ['chiave', 'valore']);
  getOrCreateSheet_(SHEET_USERS, ['email', 'name', 'sub', 'firstSeen', 'lastSeen']);
  getOrCreateSheet_(SHEET_TRIPS, ['email', 'origine', 'destinazioni', 'dataFrom', 'dataTo', 'budget', 'costoTotale', 'salvatoIl']);
  getOrCreateSheet_(SHEET_ENTITLEMENTS, ['email', 'tier', 'tripsUsed', 'status', 'createdAt', 'updatedAt', 'note', 'expiryDate', 'createdBy', 'tripsMax', 'blocked']);
  SpreadsheetApp.getActiveSpreadsheet().toast('Fogli creati. Ora inserisci le chiavi (Config o Script Properties) incluso ADMIN_EMAILS.');
}

/**
 * Inserisce le chiavi in Script Properties (PIU' SICURO del foglio).
 * Sostituisci i valori e ESEGUI UNA VOLTA, poi cancella i valori da qui.
 */
function saveKeysExample() {
  PropertiesService.getScriptProperties().setProperties({
    GOOGLE_CLIENT_ID:      'IL_TUO_CLIENT_ID.apps.googleusercontent.com',
    KIWI_API_KEY:          'la_tua_kiwi_key',
    AMADEUS_CLIENT_ID:     'il_tuo_amadeus_id',
    AMADEUS_CLIENT_SECRET: 'il_tuo_amadeus_secret',
    AMADEUS_ENV:           'test',
    ORS_API_KEY:           'la_tua_ors_key',
    ADMIN_EMAILS:          'tua-email@gmail.com',
    TRIAL_MAX_TRIPS:       '2',
    REQUIRE_LOGIN_FOR_SEARCH: 'true',
    DAILY_SEARCH_CAP:      '800',
    CURRENCY:              'EUR'
  }, false);
  SpreadsheetApp.getActiveSpreadsheet().toast('Chiavi salvate in Script Properties.');
}

// ============================================================
// MIGRAZIONE — eseguire UNA VOLTA dall'editor GAS poi eliminare
// ============================================================
