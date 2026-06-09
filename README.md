# ViaggiAI ✈️

Comparatore di viaggi (metasearch). Mostra dati reali e manda l'utente a prenotare sui siti ufficiali.  
**Filosofia:** *real data or real link* — nessun prezzo inventato, mai.

## Stack
- **Frontend:** GitHub Pages (`09_travel.html`)
- **Backend:** Google Apps Script (`Code.gs`)
- **DB:** Google Sheets (Config / Users / Trips / Entitlements)
- **Auth:** Google Identity Services (JWT verificato server-side)

## Setup rapido
Segui la guida completa in `DEPLOY_GUIDE.md`.

## File
| File | Ruolo |
|------|-------|
| `09_travel.html` | Frontend (globo 3D, wizard, risultati, prenotazione) |
| `Code.gs` | Backend GAS — NON va qui, va in Apps Script |
| `privacy.html` | Privacy Policy (personalizza i campi) |
| `termini.html` | Termini di utilizzo (personalizza i campi) |
| `DEPLOY_GUIDE.md` | Guida completa di deploy |

> `Code.gs` è incluso nel repo solo come reference. L'eseguibile va incollato nell'editor di Google Apps Script.
