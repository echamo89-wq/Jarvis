# JARVIS — Asistente Personal de IA para Windows

<div align="center">

[![JARVIS](https://img.shields.io/badge/JARVIS-v3.6.0-00bfff?style=for-the-badge&logo=electron&logoColor=white)](https://github.com/echamo89-wq/Jarvis)
[![Electron](https://img.shields.io/badge/Electron-30.x-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Gemini](https://img.shields.io/badge/Gemini-API-4285f4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![License](https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge)](LICENSE)

**Asistente holográfico de IA con voz en tiempo real, automatización de Windows e integración profunda del sistema.**

</div>

---

## Funciones

- **Conversación por voz en tiempo real** — Pipeline de audio en WebSocket con Gemini Live. Hablá e interrumpilo con naturalidad.
- **Automatización de Windows** — Abrir apps, ejecutar PowerShell, controlar archivos y ajustes del sistema.
- **Investigación web** — Búsqueda en internet, lectura de páginas y respuestas concisas con enlaces.
- **Memoria persistente** — Recuerda tu nombre, preferencias y contexto entre sesiones.
- **Motores cognitivos** — 9 motores integrados (identidad, estrategia, memoria, energía, reflexión, briefing, etc.).
- **Análisis de imágenes** — Describe imágenes, responde sobre su contenido y puede aplicarlas como fondo de pantalla.
- **UI holográfica** — Reactor animado, burbuja de mensaje premium con estados y fondo de partículas.
- **25+ integraciones de herramientas** — Sistema de archivos, automatización del navegador, control multimedia, info del sistema y más.
- **Local y seguro** — Tu API key se guarda cifrada en tu máquina. Sin cuentas ni suscripciones.

---

## Inicio rápido

### Requisitos

- [Node.js](https://nodejs.org/) v18 o superior
- Windows 10/11
- Una **API Key de Gemini** — gratis en [Google AI Studio](https://aistudio.google.com/apikey)

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/echamo89-wq/Jarvis.git
cd Jarvis

# 2. Instalar dependencias (Electron)
npm install
```

### Configuración

Copiá `.env.example` a `.env` y agregá tu API key de Gemini:

```env
GEMINI_API_KEY=your_key_here
```

También podés ingresar la API key directamente desde el panel de Configuración de la app.

### Ejecutar

```bash
npm start
```

---

## Arquitectura

```
Jarvis/
├── main.js              # Proceso principal de Electron
├── preload.js           # Puente IPC seguro
├── renderer.html        # Shell de la interfaz principal
├── splash.html          # Pantalla de carga circular
├── css/
│   └── style.css        # Estilos HUD holográficos
├── assets/              # Recursos estáticos (logo, imágenes)
├── config/              # Instrucción de sistema y protocolos
├── js/
│   ├── Core/Connection/ # WebSocket + Gemini Live API
│   ├── audio/           # Pipeline de entrada/salida de voz
│   ├── chat/            # Renderizado de mensajes y typewriter
│   ├── config/          # Configuración de la app e instrucción de sistema
│   ├── engines/         # Motores cognitivos JOS
│   ├── memory/          # Memoria persistente, hechos y tareas
│   ├── tools/           # Sistema de ejecución de herramientas
│   ├── system/          # Reporte de errores, apps, PowerShell
│   ├── ui/              # Burbuja de tareas, panel de info
│   └── state/           # Store de estado global reactivo
├── main/                # Módulos helpers de Electron
├── tests/               # Tests (Vitest)
└── docs/                # Página de documentación / landing
```

---

## Tech Stack

| Capa | Tecnología |
| :--- | :--- |
| Shell de escritorio | Electron 30 |
| UI | HTML/CSS/JS vanilla (ES Modules) |
| IA | Google Gemini API (WebSocket Live + REST) |
| Audio | Web Audio API + PCM 24kHz |
| Voz | Gemini Multimodal Live Audio (TTS dedicado) |
| Tests | Vitest |

---

## Compilar el instalador

```bash
npm run build
```

El instalador se genera en el directorio `dist/`.

---

## Redes sociales

- [YouTube — @JarvisJSS](https://www.youtube.com/@JarvisJSS)
- [Instagram](https://www.instagram.com/jarvis_js_js/)
- [TikTok — @jarvis_jjs](https://www.tiktok.com/@jarvis_jjs)

---

## Contribuir

Los pull requests son bienvenidos. Para cambios importantes, abrí un issue primero para discutir lo que querés modificar.

---

## Licencia

Este proyecto está licenciado bajo la [GNU General Public License v3](LICENSE).
