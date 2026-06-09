#!/bin/bash
set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }

PROJECT_DIR="/Volumes/LUCIOXR/Sintesidigitale/15-ViaggiAI"
TOOLS_DIR="/Volumes/LUCIOXR/tools"

echo -e "\n${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ViaggiAI — Setup clasp + Push Code.gs v5      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"

step "STEP 1/6 — Verifica disco LUCIOXR"
[ ! -d "/Volumes/LUCIOXR" ] && fail "Disco LUCIOXR non trovato."
[ ! -d "$PROJECT_DIR" ] && fail "Cartella progetto non trovata: $PROJECT_DIR"
ok "Disco e cartella OK"

step "STEP 2/6 — Installa clasp su disco esterno"
mkdir -p "$TOOLS_DIR"
CLASP_CMD="node $TOOLS_DIR/node_modules/@google/clasp/build/src/index.js"
if [ ! -f "$TOOLS_DIR/node_modules/.bin/clasp" ]; then
  command -v node &>/dev/null || fail "Node.js non trovato. Installa con: brew install node"
  echo "Installo clasp in $TOOLS_DIR..."
  npm install @google/clasp --prefix "$TOOLS_DIR" 2>&1 | tail -3
  ok "clasp installato"
else
  ok "clasp già presente"
fi
echo "Versione: $($CLASP_CMD --version)"

step "STEP 3/6 — Login Google Apps Script"
if ! $CLASP_CMD list &>/dev/null 2>&1; then
  echo -e "${YELLOW}Si aprirà il browser — usa l'account lucioxr@gmail.com${NC}"
  read -p "Premi INVIO quando pronto..." dummy
  $CLASP_CMD login
else
  ok "Già loggato"
fi

step "STEP 4/6 — Script ID"
CLASP_JSON="$PROJECT_DIR/.clasp.json"
SCRIPT_ID=""
[ -f "$CLASP_JSON" ] && SCRIPT_ID=$(python3 -c "import json; print(json.load(open('$CLASP_JSON')).get('scriptId',''))" 2>/dev/null || echo "")
if [ -z "$SCRIPT_ID" ]; then
  echo -e "${YELLOW}Dove trovarlo: Apps Script > ⚙️ Impostazioni progetto > ID script${NC}"
  read -p "Incolla Script ID: " SCRIPT_ID
  [ -z "$SCRIPT_ID" ] && fail "Script ID non fornito."
  echo "{\"scriptId\":\"$SCRIPT_ID\",\"rootDir\":\"$PROJECT_DIR\"}" > "$CLASP_JSON"
  ok "Salvato in .clasp.json"
else
  ok "Script ID: $SCRIPT_ID"
fi

step "STEP 5/6 — Backup + Push Code.gs v5"
BACKUP="$PROJECT_DIR/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP"
echo "{\"scriptId\":\"$SCRIPT_ID\",\"rootDir\":\"$BACKUP\"}" > "$BACKUP/.clasp.json"
cd "$BACKUP" && $CLASP_CMD pull 2>/dev/null && ok "Backup in $BACKUP" || warn "Backup saltato (primo push)"

cd "$PROJECT_DIR"
cp "$PROJECT_DIR/Code_v5.gs" "$PROJECT_DIR/Code.gs"
echo "{\"scriptId\":\"$SCRIPT_ID\",\"rootDir\":\"$PROJECT_DIR\"}" > "$CLASP_JSON"

[ ! -f "$PROJECT_DIR/appsscript.json" ] && cat > "$PROJECT_DIR/appsscript.json" << 'APPSJSON'
{"timeZone":"Europe/Rome","dependencies":{},"exceptionLogging":"STACKDRIVER","runtimeVersion":"V8","webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}
APPSJSON

cat > "$PROJECT_DIR/.claspignore" << 'IGNORE'
**/*.html
**/*.sh
**/*.md
**/backup_*/**
**/.git/**
**/node_modules/**
**/Code_v5.gs
IGNORE

$CLASP_CMD push --force
ok "Code.gs v5 pushato!"

step "STEP 6/6 — Istruzioni deploy"
echo -e "\n${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  ✅ PUSH OK — ora fai il deploy in Apps Script               ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  1. Apri: https://script.google.com/d/$SCRIPT_ID/edit       ║${NC}"
echo -e "${BOLD}║  2. Deploy → Manage deployments → ✏️ matita                  ║${NC}"
echo -e "${BOLD}║  3. Version: New version → Deploy                            ║${NC}"
echo -e "${BOLD}║  ⚠️  NON creare nuovo deployment — aggiorna quello esistente  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
