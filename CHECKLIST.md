# ViaggiAI — Checklist Operativa Go-Live
## Copia-incolla ogni comando, segui l'ordine esatto.

---

## FASE 1 — Setup locale e GitHub (terminale)

### 1.1 Verifica prerequisiti
```bash
git --version
# deve rispondere: git version 2.x.x
# Se non ce l'hai: https://git-scm.com/downloads

gh --version
# deve rispondere: gh version 2.x.x
# Se non ce l'hai: https://cli.github.com/
```

### 1.2 Login GitHub CLI (una volta sola)
```bash
gh auth login
# Scegli: GitHub.com → HTTPS → Login with a web browser
# Segui le istruzioni nel browser
```

### 1.3 Crea la cartella e copia i file del progetto
```bash
mkdir ~/viaggiai
cd ~/viaggiai
# Copia qui dentro questi file:
#   09_travel.html
#   privacy.html
#   termini.html
#   README.md
#   Code.gs          (solo come reference, NON viene eseguito qui)
#   DEPLOY_GUIDE.md
#   setup_github.sh
#   push_update.sh
#   CHECKLIST.md     (questo file)
```

### 1.4 Esegui lo script di setup GitHub
```bash
cd ~/viaggiai
chmod +x setup_github.sh
./setup_github.sh
```
> ✅ Output atteso: URL del repo + URL di GitHub Pages. **SALVALI.**

---

## FASE 2 — Registrazione API (browser, ~45 min)

Apri questi URL nell'ordine indicato e registra le chiavi nel file
`mie_chiavi.txt` (NON committarlo mai su GitHub — è già nel .gitignore).

```bash
# Crea il file di note sicuro (solo locale, non nel repo)
touch ~/mie_chiavi_viaggiai.txt
echo "# ViaggiAI — Chiavi API (NON condividere)" > ~/mie_chiavi_viaggiai.txt
```

### 2.1 OpenRouteService (geocoding + percorsi auto)
1. Vai su: https://openrouteservice.org/dev/#/signup
2. Registrati → verifica email
3. Dashboard → "Tokens" → copia il token default
4. Salva: `ORS_API_KEY = xxxx`

### 2.2 Amadeus Self-Service (hotel)
1. Vai su: https://developers.amadeus.com/register
2. Registrati → verifica email
3. "My Apps" → "+ New App" → nome: ViaggiAI
4. Copia `API Key` e `API Secret`
5. Salva: `AMADEUS_CLIENT_ID = xxxx` e `AMADEUS_CLIENT_SECRET = xxxx`
6. ⚠️ Lascia `AMADEUS_ENV = test` (dataset limitato ma gratuito)

### 2.3 Kiwi Tequila (voli)
1. Vai su: https://tequila.kiwi.com
2. Registrati → "My account" → "API keys"
3. Copia la chiave
4. Salva: `KIWI_API_KEY = xxxx`
5. ⚠️ Modalità sandbox/test finché non ottieni approvazione partner

### 2.4 Google OAuth Client ID (login)
1. Vai su: https://console.cloud.google.com
2. Crea o seleziona un progetto (es. "ViaggiAI")
3. Menu → "APIs & Services" → "Credentials"
4. "+ Create Credentials" → "OAuth client ID"
5. Tipo applicazione: **Web application**
6. Nome: ViaggiAI
7. In **"Authorized JavaScript origins"** aggiungi:
   - `https://TUO-USERNAME.github.io`  ← il tuo URL GitHub Pages
   - `http://localhost` (opzionale, per test locale)
8. Salva → copia il **Client ID** (termina in `.apps.googleusercontent.com`)
9. Salva: `GOOGLE_CLIENT_ID = xxxx.apps.googleusercontent.com`

> ⚠️ Se non aggiungi l'origine GitHub Pages, il login non parte. È il punto che fa faticare di più.

---

## FASE 3 — Backend Google Apps Script

### 3.1 Apri il foglio Google
1. Vai su https://sheets.google.com
2. Apri il foglio esistente **"core"** (lo vedi già su Drive) — oppure creane uno nuovo
3. Menu → **Estensioni → Apps Script**

### 3.2 Incolla il codice
1. Nell'editor Apps Script, **cancella tutto** il contenuto della finestra
2. Apri il file `Code.gs` (dalla cartella ~/viaggiai)
3. **Copia tutto** il contenuto (Ctrl+A, Ctrl+C)
4. **Incolla** nell'editor Apps Script
5. Salva (Ctrl+S) — dai un nome al progetto: "ViaggiAI"

### 3.3 Esegui setup()
1. Nel menu in alto a sinistra dell'editor, seleziona la funzione **`setup`**
2. Clicca ▶️ **Esegui**
3. Apparirà una richiesta di autorizzazione → "Review permissions" → scegli il tuo account → "Advanced" → "Go to ViaggiAI (unsafe)" → **Allow**
4. ✅ Il foglio Google ora ha 4 nuovi tab: Config, Users, Trips, Entitlements

### 3.4 Inserisci le chiavi (metodo sicuro)
1. Nell'editor Apps Script, trova la funzione **`saveKeysExample`** (in fondo al file)
2. **Sostituisci** i valori placeholder con le tue chiavi reali:
   ```
   GOOGLE_CLIENT_ID:      'xxxx.apps.googleusercontent.com',
   KIWI_API_KEY:          'la-tua-kiwi-key',
   AMADEUS_CLIENT_ID:     'il-tuo-amadeus-id',
   AMADEUS_CLIENT_SECRET: 'il-tuo-amadeus-secret',
   AMADEUS_ENV:           'test',
   ORS_API_KEY:           'la-tua-ors-key',
   ADMIN_EMAILS:          'tua-email@gmail.com',
   TRIAL_MAX_TRIPS:       '2',
   DAILY_SEARCH_CAP:      '800',
   CURRENCY:              'EUR'
   ```
3. Seleziona la funzione **`saveKeysExample`** → ▶️ **Esegui**
4. ✅ Vedrai un toast nel foglio: "Chiavi salvate in Script Properties"
5. ⚠️ **IMPORTANTE:** Ora **cancella i valori reali** dalla funzione (rimetti i placeholder), poi salva di nuovo. Le chiavi sono al sicuro in Script Properties, non nel codice.

### 3.5 Deploy come Web App
1. In alto a destra → **Deploy** → **New deployment**
2. Icona ingranaggio → **Web app**
3. Impostazioni:
   - Description: `ViaggiAI v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Clicca **Deploy**
5. Copia l'**URL** che termina in `/exec` — questo è il tuo `BACKEND_URL`
6. ✅ Verifica: apri quell'URL in una nuova tab → deve rispondere `{"success":true,...}`

> ⚠️ REGOLA D'ORO: per aggiornare il codice in futuro usa sempre
> **Deploy → Manage deployments → (matita) → Version: New version → Deploy**
> NON creare un nuovo deployment: cambierebbe l'URL e scollegherebbe il frontend.

---

## FASE 4 — Collega il frontend

### 4.1 Aggiorna 09_travel.html
```bash
cd ~/viaggiai
# Apri il file con il tuo editor (es. TextEdit su Mac, Notepad su Windows, VS Code)
# Cerca queste 2 righe (sono vicine, intorno alla riga 427):

#   const BACKEND_URL = 'https://script.google.com/macros/s/AKfycb...IL_TUO_URL.../exec';
#   const GOOGLE_CLIENT_ID = 'IL_TUO_CLIENT_ID.apps.googleusercontent.com';

# Sostituisci con i tuoi valori reali.
```

Con VS Code da terminale:
```bash
code 09_travel.html
# Ctrl+F → cerca "IL_TUO_URL" → sostituisci con il tuo URL /exec
# Ctrl+F → cerca "IL_TUO_CLIENT_ID" → sostituisci con il tuo Client ID
```

### 4.2 Push su GitHub
```bash
cd ~/viaggiai
chmod +x push_update.sh
./push_update.sh "config: add BACKEND_URL and CLIENT_ID"
```
> ✅ GitHub Pages si aggiorna automaticamente in 30-60 secondi.

---

## FASE 5 — Test end-to-end

```
1. Apri: https://TUO-USERNAME.github.io/viaggiai
   ✅ Il globo 3D gira, nessun quadratino bianco

2. Login con la tua email Admin
   ✅ Badge "🔧 Admin" in alto + Pannello Admin visibile in fondo

3. Ricerca: Milano, Italia → Parigi, Francia
   Date: entro 15 giorni da oggi (per il meteo)
   ✅ Risultati: voli, hotel (anche solo link), treni, auto, POI, meteo

4. Logout → accedi con un secondo account Google (non admin)
   ✅ Badge "Trial 0/2"
   Fai 2 ricerche con destinazione
   ✅ Alla terza: messaggio di blocco upgrade

5. Torna Admin → Pannello Admin → seleziona quell'utente → tier: Pro → Salva
   ✅ L'utente ora cerca senza limiti
```

---

## Risoluzione problemi frequenti

| Sintomo | Causa | Soluzione |
|---------|-------|-----------|
| Globo con quadratino bianco | Vecchia versione del file | Usa il `09_travel.html` aggiornato di questa sessione |
| "Errore connessione backend" | BACKEND_URL sbagliato | Verifica URL /exec, apri in tab separata |
| Login non parte | Origine non autorizzata OAuth | Aggiungi URL GitHub Pages in Google Cloud Console |
| "Token non valido" | GOOGLE_CLIENT_ID diverso frontend/backend | Usa lo stesso Client ID in entrambi |
| Zero hotel | Amadeus test dataset limitato | Normale. Mostra il deep link Booking.com |
| URL backend cambia | Nuovo deployment creato | Usa sempre "Manage deployments → New version" |

---

## Per aggiornamenti futuri del codice

```bash
cd ~/viaggiai
# 1. Modifica i file
# 2. In Apps Script: Deploy → Manage deployments → matita → New version → Deploy
# 3. Se hai modificato il frontend:
./push_update.sh "fix: descrizione della modifica"
```

---

*ViaggiAI — Checklist operativa. Generata automaticamente.*
