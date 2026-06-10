# ViaggiAI — Fascicolo Tecnico Admin
> Documento riservato · Luciano Bettoli · lucioxr@gmail.com
> Powered by SintesiDigitale · Giugno 2026

## ARCHITETTURA
| Layer | Tecnologia | Riferimento |
|---|---|---|
| Frontend | GitHub Pages | https://lucioxr-prog.github.io/15-viaggiai-travel-planner |
| Backend | Google Apps Script | AKfycbzroN18...FpFbxkVF/exec |
| Database | Google Sheets | SheetID: 1eNKqjPF...nPA |
| Auth | Google OAuth GSI | ClientID: 515915761481-9b538gnhivl7nncufak6q7i3rvitgvbm |
| Repo | GitHub | lucioxr-prog/15-viaggiai-travel-planner |
| Locale | Mac | /Volumes/LUCIOXR/Sintesidigitale/15-ViaggiAI/ |

## FILE CHIAVE
| File | Ruolo |
|---|---|
| 09_travel.html | Frontend principale |
| Code.gs | Backend GAS completo |
| appsscript.json | Configurazione runtime |
| .clasp.json | Script ID per clasp |
| chiavi_viaggiai.txt | API keys (Desktop, gitignored) |

## API KEYS (Script Properties GAS)
| Chiave | Servizio |
|---|---|
| ORS_KEY | OpenRouteService geocoding+routing |
| GOOGLE_CLIENT_ID | Google OAuth |
| AMADEUS_KEY/SECRET | Hotel (dataset test) |
| ADMIN_EMAILS | lucioxr@gmail.com |
| TRIAL_MAX_TRIPS | 2 |

## TIER UTENTI
| Tier | Ricerche | PDF | Come assegnare |
|---|---|---|---|
| Admin | Illimitate | Si | Script Properties ADMIN_EMAILS |
| Pro | Illimitate | Si | Pannello Admin → cambia tier |
| Trial | 2 totali | No | Default al primo login |

## AGGIORNARE IL BACKEND

 Risposta attesa: {"success":true,"service":"ViaggiAI backend"}

## SHEETS — TAB
| Tab | Colonne chiave |
|---|---|
| Config | key, value |
| Users | email, name, sub, createdAt |
| Trips | email, origin, destinations, dates, totalCost |
| Entitlements | email, tier, tripsUsed, status, expiryDate, blocked (11 col) |

## SICUREZZA
- Auth fail-closed: Client ID mancante = blocco totale
- Trial counter atomico con LockService
- Token refresh automatico ogni 45 minuti
- HTML output sempre escapato con esc()

## LIMITI GRATUITI
| Servizio | Limite | Al limite |
|---|---|---|
| Apps Script | 20k req/giorno | Blocca senza addebito |
| OpenRouteService | 2.000 req/giorno | Blocca senza addebito |
| Open-Meteo | Nessuno | — |
| Amadeus | Dataset test | Array vuoto |
| Kiwi/Booking | Deep link | Sempre disponibili |

## LINKS
- Apps Script: https://script.google.com/home/projects/168MpuNnbIIV9fnx0Klnt0aioGp6xt1TND8c_fNyZeT2NpIBpi5p-59v_/edit
- GitHub: https://github.com/lucioxr-prog/15-viaggiai-travel-planner
