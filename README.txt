# JARVIS — AI Personal Assistant for Windows

## ✨ Features

- 🎙️ **Real-time voice conversation** — Live WebSocket audio pipeline with Gemini Live API
- 🖥️ **Windows automation** — Open apps, run PowerShell commands, control files and system settings
- 🌤️ **Integrations** — Gmail (OAuth device-flow), GitHub, OpenWeatherMap
- 👁️ **Screen vision** — Understands what's on your screen via vision-language models (Qwen3-VL / Moondream)
- 🧠 **Persistent memory** — Remembers your name, preferences, and context across sessions
- 📊 **Diagnostics panel** — Real-time system monitoring and connection health
- 🎨 **Holographic HUD** — Stark-inspired glassmorphic UI with animated cyber rings
- 🔒 **Local-first** — Runs 100% on your machine. No cloud account required beyond your Gemini API key.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- Windows 10/11 (PowerShell automation features are Windows-only)
- A **Gemini API Key** — get one free at [Google AI Studio](https://aistudio.google.com/apikey)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_GITHUB_USERNAME/jarvis.git
cd jarvis

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
```

### Configuration

Edit `.env` in the root directory and add your Gemini API key:

```env
GEMINI_API_KEY=your_key_here
```

> **Tip:** You can also enter the API key directly from the app's **Settings** panel — no need to edit files manually.

### Run

```bash
npm start
```

---

## 🗂️ Project Structure

```
jarvis/
├── main.js              # Electron main process
├── preload.js           # Secure IPC bridge
├── renderer.html         # Main UI shell
├── css/
│   └── style.css        # Holographic HUD styles
└── js/
    ├── state/           # Global state store (IDLE / CONNECTING / LISTENING / SPEAKING / WORKING / ERROR)
    ├── chat/            # Message rendering & history
    ├── audio/           # Voice input/output pipeline
    ├── tools/            # Tool definitions (GitHub, Gmail, weather, PC control, vision)
    ├── system/           # Error reporting, app launching, PowerShell execution
    └── engine/           # WebSocket engine — connection to Gemini Live API
```

> Pure ES Modules throughout — no frameworks or bundlers, no external dependencies beyond `electron` and `ws`.

---

## ⚙️ Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key (required) |
| `OPENWEATHER_API_KEY` | For weather integration (optional) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | For GitHub integration (optional) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Gmail OAuth device-flow (optional) |

---

## 🔧 First-Time Setup

On first launch, JARVIS will guide you through an onboarding tour:

1. Enter your **name** and preferred **language**
2. Paste your **Gemini API key** and click **Test Key**
3. Set your **city** for weather integration (optional)
4. Connect **GitHub** / **Gmail** if you want those integrations active
5. Click **Save & Start**

---

## 🛠️ Troubleshooting

| Issue | Likely cause / fix |
|---|---|
| No audio input detected | Check Windows microphone permissions for the app |
| WebSocket disconnects randomly | Verify your Gemini API key quota hasn't been exceeded |
| PowerShell commands fail silently | Commands run with `-NoProfile -NonInteractive -ExecutionPolicy Bypass`; check the diagnostics panel for stderr output |
| App crashes on close | Known issue — renderer can crash when closing the window while a WebSocket session is active (see Roadmap) |

---

## 🗺️ Roadmap

- [ ] Fix renderer crash on window close with an active WebSocket session
- [ ] Resolve intermittent audio input error
- [ ] Eliminate audio echo/feedback loop
- [ ] Polish and modernize the HUD interface
- [ ] Optional packaging for distribution (installer)

---

## 📋 Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 30 |
| UI | Vanilla HTML/CSS/JS (ES Modules) |
| AI | Google Gemini Live API (WebSocket) |
| Vision | Qwen3-VL (recommended) / Moondream (lightweight fallback) |
| Audio | Web Audio API + AudioWorklet |

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Open a PR describing the change and why it's needed

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
