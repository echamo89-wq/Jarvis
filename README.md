# JARVIS — AI Personal Assistant for Windows

<div align="center">

[![JARVIS](https://img.shields.io/badge/JARVIS-MK.II-00bfff?style=for-the-badge&logo=electron&logoColor=white)](https://github.com/echamo89-wq/Jarvis)
[![Electron](https://img.shields.io/badge/Electron-30.x-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Gemini](https://img.shields.io/badge/Gemini-API-4285f4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**A Stark-inspired holographic AI assistant with real-time voice, Windows automation, and deep system integration.**

</div>

---

## Features

- **Real-time voice conversation** — Live WebSocket audio pipeline with Gemini. Speak and interrupt naturally.
- **Windows automation** — Open apps, run PowerShell, control files and system settings.
- **Web research** — Search the internet, fetch pages, and summarize information.
- **Persistent memory** — Remembers your name, preferences, and context across sessions.
- **Cognitive engines** — 9 integrated engines (identity, strategy, memory, energy, reflection, briefing, etc.)
- **Holographic UI** — Animated arc reactor, premium message bubble with states, particle background.
- **25+ tool integrations** — File system, browser automation, media control, system info, and more.
- **100% local** — No cloud account required. Runs entirely on your machine.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A **Gemini API Key** — get one free at [Google AI Studio](https://aistudio.google.com/apikey)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/echamo89-wq/Jarvis.git
cd jarvis

# 2. Install root dependencies (Electron)
npm install

# 3. Install server dependencies
cd server && npm install && cd ..
```

### Configuration

Copy `.env.example` to `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_key_here
```

You can also enter the API key directly from the app's Settings panel.

### Run

```bash
npm start
```

---

## Architecture

```
Jarvis/
├── main.js              # Electron main process
├── preload.js           # Secure IPC bridge
├── renderer.html        # Main UI shell
├── splash.html          # Boot splash screen
├── css/
│   └── style.css        # Holographic HUD styles
├── js/
│   ├── Core/Connection/ # WebSocket + Gemini Live API
│   ├── audio/           # Voice input/output pipeline
│   ├── chat/            # Message rendering & typewriter
│   ├── config/          # App configuration & system instruction
│   ├── engines/         # JOS cognitive engines (9 modules)
│   ├── tools/           # 25+ tool execution system
│   ├── system/          # Error reporting, apps, PowerShell
│   ├── ui/              # Task bubble, info panel
│   └── state/           # Global reactive state store
├── server/              # Local Express backend (auth, feedback, proxy)
│   ├── routes/
│   ├── middleware/
│   └── data/
└── main/                # Electron helper modules
```

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Desktop shell | Electron 30 |
| UI | Vanilla HTML/CSS/JS (ES Modules) |
| AI | Google Gemini API (WebSocket Live) |
| Backend | Express.js + SQLite |
| Audio | Web Audio API + AudioWorklet |
| Speech | Gemini Multimodal Live Audio |

---

## Building

To build the Windows installer:

```bash
npm run build
```

The installer will be created in the `dist/` directory.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## License

This project is licensed under the [MIT License](LICENSE).
