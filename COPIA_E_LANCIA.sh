#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  ViaggiAI — Copia file e lancia deploy
#
#  QUESTO È IL PRIMO SCRIPT DA ESEGUIRE.
#  Scarica questo file nella cartella Download, poi esegui:
#
#    chmod +x ~/Downloads/COPIA_E_LANCIA.sh
#    ~/Downloads/COPIA_E_LANCIA.sh
#
#  Fa tutto da solo:
#    1. Copia i file del progetto da ~/Downloads a 15-ViaggiAI
#    2. Entra nella cartella
#    3. Lancia DEPLOY_VIAGGIAI.sh
# ═══════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RED='\033[0;31m'
NC='\033[0m'

DEST="/Volumes/LUCIOXR/Sintesidigitale/15-ViaggiAI"
SRC="$HOME/Downloads"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ViaggiAI — Copia file + avvio deploy              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Verifica disco esterno montato
if [ ! -d "/Volumes/LUCIOXR" ]; then
  echo -e "${RED}❌ Disco LUCIOXR non trovato. Collegalo e riprova.${NC}"
  exit 1
fi

# Verifica cartella destinazione
if [ ! -d "$DEST" ]; then
  echo -e "${RED}❌ Cartella $DEST non trovata.${NC}"
  echo -e "   Creala con: mkdir -p \"$DEST\""
  exit 1
fi

# File da copiare
FILES=(
  "09_travel.html"
  "Code.gs"
  "privacy.html"
  "termini.html"
  "README.md"
  "CHECKLIST.md"
  "DEPLOY_VIAGGIAI.sh"
  "AGGIORNA_SITO.sh"
)

echo -e "${CYAN}${BOLD}▶ Copia file da Downloads a 15-ViaggiAI...${NC}"
for f in "${FILES[@]}"; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$DEST/$f"
    echo -e "  ${GREEN}✅ $f${NC}"
  else
    echo -e "  ${RED}⚠️  $f non trovato in Downloads — saltato${NC}"
  fi
done

# Rendi eseguibili gli script
chmod +x "$DEST/DEPLOY_VIAGGIAI.sh" "$DEST/AGGIORNA_SITO.sh" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}✅ File copiati. Avvio deploy...${NC}"
echo ""

# Entra nella cartella e lancia il deploy
cd "$DEST"
bash DEPLOY_VIAGGIAI.sh

