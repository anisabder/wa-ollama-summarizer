# WhatsApp summarizer (Ollama)

Summarizes the last N messages of any WhatsApp chat with a local Ollama model. It runs WhatsApp Web in a headless Chromium (whatsapp-web.js) and keeps a local SQLite copy of your messages. Nothing leaves your machine.

You control it by sending commands to yourself from your phone, for example `!summarize 50 family`. The summary arrives in your own chat.

## Requirements

- Node.js 22.13 or newer
- Chromium or Chrome (Edge also works on Windows)
- [Ollama](https://ollama.com) with a model, for example `gemma3:4b` (or `qwen2.5:3b` for less RAM)
- A computer that stays on while you want it to answer

## Install on Linux / Omarchy

```bash
sudo pacman -S chromium ollama
sudo systemctl enable --now ollama
ollama pull gemma3:4b

git clone https://github.com/<your-username>/wa-ollama-summarizer.git
cd wa-ollama-summarizer
bash scripts/install-omarchy.sh
```

The installer checks your setup, installs dependencies, creates a systemd user service, adds the `wasum` command, and adds a "WhatsApp Summarizer" entry to your app launcher.

First time only: link your WhatsApp.

```bash
wasum run        # scan the QR code, wait for "Ready", then press Ctrl+C
```

Then pick how you want to run it:

**From the app launcher (window mode).** Press Super+Space, type `whatsapp` and press Enter. The bot opens in its own terminal window and shows its log. To stop it, click that window and press Super+W. Opening it twice is blocked, so you cannot start two copies by accident. If you only use this mode, run `wasum noautostart` so the background service does not also start at login.

**In the background.** Run `wasum start`. It also starts at every login.

| Command | What it does |
|---|---|
| `wasum window` | Open the bot in its own window (same as the launcher entry) |
| `wasum run` | Run in the current terminal, for linking or debugging (`DEBUG=true wasum run`) |
| `wasum start` / `stop` / `restart` | Control the background service |
| `wasum status` / `logs` | Show the service state / follow its log |
| `wasum clean` | Kill a leftover browser after a crash |
| `wasum autostart` / `noautostart` | Turn the background service at login on or off |

If you update Node later, run the installer again. To add only the launcher entry, run `bash scripts/install-launcher.sh`.

## Install on Windows

Not tested by the author yet, so please report problems.

1. Install Node.js (LTS, 22.13 or newer), Google Chrome (or use Edge), and Ollama for Windows.
2. Run `ollama pull gemma3:4b`.
3. In PowerShell, inside the project folder:
   ```powershell
   $env:PUPPETEER_SKIP_DOWNLOAD="true"; npm install
   ```
4. Double-click `scripts\start-windows.bat`, scan the QR code the first time.
5. To start at login: press Win+R, type `shell:startup`, and put a shortcut to `start-windows.bat` there.

Each install links to WhatsApp as its own device and keeps its own message history.

## Android

There is no Android version of the bot. It needs a desktop browser and enough memory for the model. Your phone is already the remote control: send commands to yourself from the WhatsApp app and the summary arrives there.

## Commands (send from your own "Message yourself" chat)

| Command | What it does |
|---|---|
| `!summarize 50 family` | Summarizes the last 50 messages of the chat matching "family" |
| `!summarize 200 L1 G01` | Any number up to `MAX_COUNT` (default 500) |
| `!chats` | Lists stored chats with message counts |
| `!chats stud` | Searches stored chats by name |
| `!ping` | Quick check that the bot is listening |
| `!help` | Shows the commands |

Typing `!summarize 50` inside a chat also works. The summary still arrives in your own chat, but the command text is visible to others in that chat. Only messages you send trigger the bot.

## Configuration

Copy `.env.example` to `.env`. Everything is optional.

| Variable | Default | Meaning |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Where Ollama runs |
| `OLLAMA_MODEL` | `gemma3:4b` | Model used for summaries |
| `OLLAMA_NUM_CTX` | `8192` | Context size |
| `OLLAMA_TIMEOUT_MS` | `600000` | Max wait for one answer |
| `CHUNK_CHARS` | `7000` | Long chats are split into chunks of this size, then merged |
| `DEFAULT_COUNT` / `MAX_COUNT` | `50` / `500` | Default and maximum messages per summary |
| `SUMMARY_LANGUAGE` | empty | Empty means the chat's main language |
| `PAIRING_PHONE` | empty | Link with a code instead of a QR (country code first, digits only) |
| `CHROME_PATH` | auto | Browser to use |
| `BACKFILL_CHATS` / `BACKFILL_MESSAGES` | `30` / `100` | Recent history read at startup |
| `WA_WEB_VERSION` | empty | Pin a WhatsApp Web version, only if the bot gets stuck loading |
| `DEBUG` | `false` | Print every message event and why messages are skipped |
| `DB_PATH` / `AUTH_DIR` | `./data/messages.db` / `./auth` | Where data and the WhatsApp session live |

## How it works

- On startup the bot reads recent messages from your most recent chats and saves them. While it runs it saves every new message. Your own `!` commands and your self-chat are never stored.
- When you ask for a summary, it first fetches the latest messages of that chat from WhatsApp Web, so messages that arrived while your PC was off are included. It then sends the last N to Ollama. Long transcripts are split, summarized in parts, then merged.
- One job runs at a time.

## Limits

- History is whatever WhatsApp Web has available for each chat.
- Voice notes, images and videos are not read, only marked.
- The computer must be on to answer commands.
- This is an unofficial WhatsApp client. WhatsApp can restrict numbers that use unofficial clients. Use at your own risk.

## Privacy

`auth/` holds your WhatsApp session and `data/` holds your messages. Both are in `.gitignore`. Never commit them, and never share them.

## Troubleshooting

- No reply to a command: run with `DEBUG=true` and send `!ping`.
- Stuck before a QR code or "Ready": check the "Browser:" line at startup and set `CHROME_PATH` if it is wrong.
- Stuck at "Loading WhatsApp Web": set `WA_WEB_VERSION` to a version from the wppconnect-team/wa-version repo (name without `.html`, for example `2.3000.1050732206-alpha`).
- "Cannot reach Ollama": check that the Ollama service is running. "Model not found": run `ollama pull` again.
- Logged out: delete the `auth` folder and link again.
- Service or launcher fails to start after a Node update: run `scripts/install-omarchy.sh` again.
- "Browser is already running" after a crash: run `wasum clean`, then start again.
- Super+W closes whichever window has focus, so click the bot window first.

## Development

```bash
npm install
npm test
```

The tests cover storage, command parsing, message conversion, transcript chunking, browser detection and the Ollama calls (against a fake server). The WhatsApp connection itself can only be tested with a real account.
