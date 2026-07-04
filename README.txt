# JARVIS — AI Personal Assistant for Windows

<div align="center">

![JARVIS](https://img.shields.io/badge/JARVIS-MK.37-00b4ff?style=for-the-badge&logo=electron&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-30.x-47848f?style=for-the-badge&logo=electron&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-API-4285f4?style=for-the-badge&logo=google&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**A Stark-inspired holographic AI assistant with real-time voice, Windows automation, and deep system integration.**

</div>

---

## ✨ Features

- 🎙️ **Real-time voice conversation** — Live WebSocket audio pipeline with Gemini
- 🤖 **Multi-model AI** — Gemini (primary), with optional OpenAI, Anthropic & Groq support
- 🖥️ **Windows automation** — Open apps, run PowerShell, control files and system settings
- 🌤️ **Integrations** — Gmail, GitHub, OpenWeatherMap, Spotify
- 🧠 **Persistent memory** — Remembers your name, preferences, and context across sessions
- 📊 **Diagnostics panel** — Real-time system monitoring and connection health
- 🎨 **Holographic HUD** — Stark-inspired glassmorphic UI with animated cyber rings
- 🔒 **Local-first** — Runs 100% on your machine. No cloud account required.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A **Gemini API Key** — get one free at [Google AI Studio](https://aistudio.google.com/apikey)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_GITHUB_USERNAME/jarvis.git
cd jarvis

# 2. Install root dependencies (Electron)
npm install

# 3. Install server dependencies
cd server && npm install && cd ..

# 4. Configure environment
cp .env.example .env
```

### Configuration

Edit `.env` in the root directory and add your Gemini API key:

```env
GEMINI_API_KEY=your_key_here
```

> **Tip:** You can also enter the API key directly from the app's **Settings** panel — no need to edit files manually.

Edit `server/.env` and generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
JWT_SECRET=paste_generated_secret_here
```

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
├── renderer.html        # Main UI shell
├── css/
│   └── style.css        # Holographic HUD styles
├── js/
│   ├── config/          # App configuration & settings
│   ├── chat/            # Message rendering & history
│   ├── audio/           # Voice input/output pipeline
│   ├── system/          # Error reporting, apps, PowerShell
│   ├── ui/              # UI components & modals
│   ├── engines/         # Three.js 3D reactor engine
│   └── state/           # Global state store
├── server/              # Local Express backend
│   ├── routes/          # API endpoints (auth, feedback, proxy)
│   ├── models/          # Database models
│   └── data/            # SQLite DB & release data
└── main/                # Electron helper modules
```

---

## ⚙️ Environment Variables

### Root `.env`

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key |

### `server/.env`

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `3001`) |
| `JWT_SECRET` | Secret for JWT signing (generate randomly) |
| `NODE_ENV` | `development` or `production` |
| `GEMINI_API_KEY` | Gemini key (optional, can use root .env) |
| `OPENAI_API_KEY` | OpenAI key (optional) |
| `ANTHROPIC_API_KEY` | Anthropic Claude key (optional) |
| `GROQ_API_KEY` | Groq key (optional) |

---

## 🔧 First-Time Setup

On first launch, JARVIS will guide you through an onboarding tour:

1. Enter your **name** and preferred **language**
2. Paste your **Gemini API key** and click **Test Key**
3. Set your **city** for weather integration (optional)
4. Click **Save & Start**

---

## 📋 Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 30 |
| UI | Vanilla HTML/CSS/JS (ES Modules) |
| 3D Engine | Three.js |
| AI | Google Gemini API (WebSocket) |
| Backend | Express.js + SQLite |
| Audio | Web Audio API + AudioWorklet |

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

[MIT](LICENSE)
