#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  ViaggiAI — Script di deploy completo
#  Esegui UNA VOLTA dalla cartella 15-ViaggiAI sul disco esterno
#  Percorso: /Volumes/LUCIOXR/Sintesidigitale/15-ViaggiAI
#
#  Cosa fa questo script (in ordine):
#    1. Verifica che sei nella cartella giusta
#    2. Crea .gitignore professionale
#    3. Crea README con descrizione progetto
#    4. Init repo git locale
#    5. Crea repo GitHub pubblico con nome e descrizione corretti
#    6. Push di tutti i file
#    7. Attiva GitHub Pages (branch main, root)
#    8. Stampa URL finali da salvare
#
#  PREREQUISITI (già fatti):
#    ✅ git installato
#    ✅ gh installato e loggato come lucioxr-prog
#    ✅ file del progetto copiati in questa cartella
#
#  ATTENZIONE: NON inserire mai chiavi API in questo script.
# ═══════════════════════════════════════════════════════════════════

set -e  # blocca al primo errore

# ── Colori per output leggibile ──────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # reset

step() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }

# ── Configurazione repo ──────────────────────────────────────────
REPO_NAME="15-viaggiai-travel-planner"
REPO_DESC="ViaggiAI — Comparatore metasearch di viaggi AI. Real-data-or-real-link: voli, hotel, treni, auto. Frontend GitHub Pages + Backend Google Apps Script."
EXPECTED_DIR="15-ViaggiAI"

# ════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        ViaggiAI — Deploy Automatico v1.0                    ║${NC}"
echo -e "${BOLD}║        Repo: ${REPO_NAME}          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"

# ── STEP 1: Verifica cartella corretta ───────────────────────────
step "STEP 1/8 — Verifica posizione"
CURRENT=$(basename "$PWD")
if [ "$CURRENT" != "$EXPECTED_DIR" ]; then
  fail "Sei in '$PWD' ma dovresti essere in '$EXPECTED_DIR'.\nEsegui: cd /Volumes/LUCIOXR/Sintesidigitale/15-ViaggiAI"
fi
ok "Cartella corretta: $PWD"

# ── STEP 2: Verifica file progetto presenti ──────────────────────
step "STEP 2/8 — Verifica file progetto"
REQUIRED=("09_travel.html" "Code.gs" "privacy.html" "termini.html" "README.md" "CHECKLIST.md")
MISSING=()
for f in "${REQUIRED[@]}"; do
  if [ ! -f "$f" ]; then
    MISSING+=("$f")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  fail "File mancanti: ${MISSING[*]}\nAssicurati di aver copiato tutti i file nella cartella prima di eseguire questo script."
fi
ok "Tutti i file del progetto presenti"
ls -la

# ── STEP 3: Crea .gitignore ──────────────────────────────────────
step "STEP 3/8 — Creazione .gitignore"
cat > .gitignore << 'EOF'
# ── Chiavi e segreti — MAI su GitHub ──
*.env
.env
.env.*
secrets.json
keys.json
mie_chiavi*.txt
chiavi*.txt
*_keys.txt
*_secrets.txt

# ── macOS ──
.DS_Store
.AppleDouble
.LSOverride
._*
.Spotlight-V100
.Trashes

# ── Editor ──
.vscode/
.idea/
*.swp
*.swo
*~

# ── Node (per eventuali tool futuri) ──
node_modules/
npm-debug.log*

# ── Build artifacts ──
dist/
build/
*.min.js.map
EOF
ok ".gitignore creato (chiavi API protette)"

# ── STEP 4: Configura identità git locale (se non già fatto) ─────
step "STEP 4/8 — Configurazione identità Git"
GIT_EMAIL=$(git config --global user.email 2>/dev/null || echo "")
GIT_NAME=$(git config --global user.name 2>/dev/null || echo "")

if [ -z "$GIT_EMAIL" ] || [ -z "$GIT_NAME" ]; then
  warn "Identità Git non configurata. Uso dati account GitHub..."
  GH_USER=$(gh api user --jq .login)
  GH_EMAIL=$(gh api user/emails --jq '.[0].email' 2>/dev/null || echo "${GH_USER}@users.noreply.github.com")
  git config --global user.name "$GH_USER"
  git config --global user.email "$GH_EMAIL"
  ok "Identità Git configurata: $GH_USER <$GH_EMAIL>"
else
  ok "Identità Git già configurata: $GIT_NAME <$GIT_EMAIL>"
fi

# ── STEP 5: Init repo git locale ────────────────────────────────
step "STEP 5/8 — Inizializzazione repo Git locale"
if [ -d ".git" ]; then
  warn "Repo git già esistente — proseguo senza reinizializzare"
else
  git init
  git branch -M main
  ok "Repo git inizializzato (branch: main)"
fi

# Stage tutti i file
git add -A
git status

# Primo commit
git commit -m "feat: ViaggiAI v1 — metasearch viaggi AI

Stack: GitHub Pages (frontend) + Google Apps Script (backend) + Google Sheets (DB)
Auth: Google Identity Services (JWT verificato server-side)
APIs: Kiwi Tequila (voli), Amadeus (hotel), ORS (percorsi), OSM/Overpass (POI), Open-Meteo
Sistema tier: Admin / Pro / Trial (2 viaggi gratuiti)
Fix: canvas WebGL fade-in (no quadratino bianco al caricamento)
Filosofia: real-data-or-real-link — nessun prezzo inventato

Progetto: SintesiDigitale #15
Autore: lucioxr-prog"

ok "Commit iniziale creato"

# ── STEP 6: Crea repo GitHub ─────────────────────────────────────
step "STEP 6/8 — Creazione repository GitHub"
GH_USER=$(gh api user --jq .login)

# Verifica se il repo esiste già
if gh repo view "$GH_USER/$REPO_NAME" &>/dev/null; then
  warn "Il repo '$REPO_NAME' esiste già su GitHub."
  warn "Aggiungo il remote e faccio push..."
  git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git" 2>/dev/null || true
  git push -u origin main --force
else
  gh repo create "$REPO_NAME" \
    --public \
    --description "$REPO_DESC" \
    --source=. \
    --remote=origin \
    --push
  ok "Repo GitHub creato e file pushati"
fi

# ── STEP 7: Attiva GitHub Pages ──────────────────────────────────
step "STEP 7/8 — Attivazione GitHub Pages"
sleep 3  # attende che il repo sia disponibile via API

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/$GH_USER/$REPO_NAME/pages" \
  -f '{"source":{"branch":"main","path":"/"}}' 2>/dev/null \
  && ok "GitHub Pages attivato (branch main, root)" \
  || warn "GitHub Pages già attivo o attivazione manuale necessaria (vai su Settings → Pages nel browser)"

# ── STEP 8: Stampa URL finali ────────────────────────────────────
step "STEP 8/8 — Riepilogo URL"
PAGES_URL="https://${GH_USER}.github.io/${REPO_NAME}"
REPO_URL="https://github.com/${GH_USER}/${REPO_NAME}"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  ✅  DEPLOY COMPLETATO — SALVA QUESTI URL ORA                  ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  📦 Repository GitHub:                                           ║${NC}"
echo -e "      ${CYAN}${REPO_URL}${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  🌐 GitHub Pages (il tuo sito — attivo in 1-2 minuti):          ║${NC}"
echo -e "      ${CYAN}${PAGES_URL}${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  PROSSIMI PASSI MANUALI (nel browser):                          ║${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  1. GOOGLE CLOUD CONSOLE — crea OAuth Client ID                 ║${NC}"
echo -e "${BOLD}║     https://console.cloud.google.com                            ║${NC}"
echo -e "     ${YELLOW}Aggiungi origine autorizzata: ${PAGES_URL}${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  2. OPENROUTESERVICE — chiave geocoding + percorsi              ║${NC}"
echo -e "${BOLD}║     https://openrouteservice.org/dev/#/signup                   ║${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  3. AMADEUS — chiavi hotel                                      ║${NC}"
echo -e "${BOLD}║     https://developers.amadeus.com/register                     ║${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  4. KIWI TEQUILA — chiave voli                                  ║${NC}"
echo -e "${BOLD}║     https://tequila.kiwi.com                                    ║${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  5. GOOGLE SHEETS + APPS SCRIPT — incolla Code.gs               ║${NC}"
echo -e "${BOLD}║     Apri il foglio 'core' → Estensioni → Apps Script            ║${NC}"
echo -e "${BOLD}║                                                                  ║${NC}"
echo -e "${BOLD}║  Guida completa passo per passo: apri CHECKLIST.md              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

