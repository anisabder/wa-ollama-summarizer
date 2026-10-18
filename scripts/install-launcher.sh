#!/usr/bin/env bash
# Adds "WhatsApp Summarizer" to the app launcher (Super+Space, then type "whatsapp").
# It opens the bot in its own window; closing that window (Super+W) stops the bot.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v node >/dev/null || { echo "ERROR: node not found in this terminal." >&2; exit 1; }
chmod +x "$DIR/scripts/wasum" "$DIR/scripts/wasum-window"

CONF="${XDG_CONFIG_HOME:-$HOME/.config}/wa-summarizer"
mkdir -p "$CONF"
command -v node > "$CONF/node-path"

DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
mkdir -p "$DATA/icons/hicolor/scalable/apps" "$DATA/applications"
cp "$DIR/assets/wa-summarizer.svg" "$DATA/icons/hicolor/scalable/apps/wa-summarizer.svg"

cat > "$DATA/applications/wa-summarizer.desktop" <<ENTRY
[Desktop Entry]
Type=Application
Version=1.0
Name=WhatsApp Summarizer
GenericName=WhatsApp chat summarizer
Comment=Starts the bot in its own window. Close the window (Super+W) to stop it.
Exec="$DIR/scripts/wasum-window"
Icon=wa-summarizer
Terminal=false
Categories=Utility;Network;
Keywords=whatsapp;summarizer;bot;
ENTRY

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DATA/applications" || true
fi

cat <<DONE
Launcher installed.

  Open it:  Super+Space, then type "whatsapp" and press Enter
  Stop it:  click its window and press Super+W

If it does not show up in the launcher, log out and back in once.
DONE
