#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  ViaggiAI — Aggiorna il sito dopo modifiche
#  Usalo ogni volta che modifichi un file (es. dopo aver inserito
#  BACKEND_URL e GOOGLE_CLIENT_ID in 09_travel.html)
#
#  UTILIZZO:
#    ./AGGIORNA_SITO.sh "descrizione breve della modifica"
#
#  ESEMPI:
#    ./AGGIORNA_SITO.sh "config: aggiunti BACKEND_URL e CLIENT_ID"
#    ./AGGIORNA_SITO.sh "fix: aggiornato link prenotazione hotel"
#    ./AGGIORNA_SITO.sh "feat: aggiunta sezione FAQ"
# ═══════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# Messaggio commit: usa argomento passato o chiede interattivamente
if [ -n "$1" ]; then
  MSG="$1"
else
  echo -e "${YELLOW}Descrivi brevemente la modifica (es: 'config: aggiunti BACKEND_URL'):${NC}"
  read -r MSG
  if [ -z "$MSG" ]; then
    MSG="update: aggiornamento $(date '+%Y-%m-%d %H:%M')"
  fi
fi

echo ""
echo -e "${CYAN}${BOLD}▶ Modifiche in sospeso:${NC}"
git status --short

# Verifica che ci siano effettivamente modifiche
if git diff --quiet && git diff --staged --quiet; then
  echo -e "${YELLOW}⚠️  Nessuna modifica da pushare.${NC}"
  exit 0
fi

echo ""
echo -e "${CYAN}${BOLD}▶ Aggiungo tutti i file modificati...${NC}"
git add -A

echo -e "${CYAN}${BOLD}▶ Commit: \"$MSG\"${NC}"
git commit -m "$MSG"

echo -e "${CYAN}${BOLD}▶ Push su GitHub...${NC}"
git push origin main

GH_USER=$(gh api user --jq .login)
REPO_NAME=$(basename "$(git remote get-url origin)" .git)
PAGES_URL="https://${GH_USER}.github.io/${REPO_NAME}"

echo ""
echo -e "${GREEN}${BOLD}✅ Sito aggiornato!${NC}"
echo -e "   ${CYAN}${PAGES_URL}${NC}"
echo -e "   (attendi 30-60 secondi per la propagazione)"
echo ""

