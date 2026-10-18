#!/usr/bin/env bash
# Installs dependencies, a systemd user service and the `wasum` command.
# Works on Omarchy / Arch; should work on other systemd Linux distros too.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() { echo "ERROR: $1" >&2; exit 1; }

command -v node >/dev/null || fail "Node.js not found. Install it with: mise use -g node@lts"
command -v npm  >/dev/null || fail "npm not found. Install Node.js (mise use -g node@lts)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || fail "Node 22.13 or newer is required (found $(node -v))."

if [ -z "${CHROME_PATH:-}" ] && ! command -v chromium >/dev/null && ! command -v google-chrome-stable >/dev/null; then
  fail "Chromium not found. Install it with: sudo pacman -S chromium"
fi
command -v ollama >/dev/null || echo "Note: ollama not found. Install it with: sudo pacman -S ollama && sudo systemctl enable --now ollama"

echo "Installing dependencies..."
(cd "$DIR" && PUPPETEER_SKIP_DOWNLOAD=true npm install --no-audit --no-fund)

[ -f "$DIR/.env" ] || cp "$DIR/.env.example" "$DIR/.env"

NODE_BIN="$(command -v node)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/wa-summarizer.service" <<UNIT
[Unit]
Description=WhatsApp Ollama summarizer
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$NODE_BIN --disable-warning=ExperimentalWarning --disable-warning=DEP0040 src/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
UNIT

chmod +x "$DIR/scripts/wasum"
mkdir -p "$HOME/.local/bin"
ln -sf "$DIR/scripts/wasum" "$HOME/.local/bin/wasum"

systemctl --user daemon-reload
systemctl --user enable wa-summarizer.service

bash "$DIR/scripts/install-launcher.sh" >/dev/null

cat <<DONE

Installed.

  First time only (links WhatsApp, skip if you already scanned a QR code):
      wasum run        scan the QR code, wait for "Ready", then press Ctrl+C
  Then either:
      Super+Space, type "whatsapp"   open the bot in its own window (Super+W stops it)
  or:
      wasum start      run in the background (it also starts at every login)
      wasum logs       watch what it is doing
      wasum status     check that it is running

If "wasum" is not found, open a new terminal (~/.local/bin must be in your PATH).
If you update Node later, run this installer again.
DONE
