import { getFunctionDeclarations as getIntegrationDeclarations } from '../integrations/index.js';

export function getFunctionDeclarations() {
  return [
    {
      name: 'launch_app',
      description: `Opens any desktop application, program, or website. PRIORITY TOOL — always try this FIRST for any app-opening request.
SUPPORTED (Spanish & English names work):
• Browsers: chrome/navegador, firefox, edge, brave
• Communication: discord, whatsapp/wsp, telegram/tg, slack, teams, zoom
• Music: spotify/música, vlc/reproductor
• Productivity: word, excel/planilla, powerpoint/ppt/presentaciones, outlook/correo, onenote, notepad/notas, notepad++
• Code: vscode/code/vs code, cursor, windsurf, postman, docker
• System: terminal/consola, cmd, powershell/shell, calculadora/calculator, paint, archivos/explorador
• Settings: settings/configuración/ajustes, administrador de tareas/task manager
• Social: instagram/ig, twitter/x, facebook/fb, tiktok, linkedin, github
• Google: youtube/yt, gmail/correo, drive, maps/mapas, chatgpt/gpt
• Streaming: netflix, obs/streaming/obs studio
• Gaming: steam, epic games, battle.net
• Design: photoshop/ps, illustrator/ai, figma/diseño
• Store: tienda windows/store, fotos/photos, cámara/camera, reloj/clock/alarma
• Other: snipping tool/recortes/captura de pantalla, notion, obsidian, unity, winrar, 7zip`,
      parameters: { type: 'object', properties: { appName: { type: 'string', description: 'App name in Spanish or English. Use natural names like "navegador", "música", "calculadora", "correo", "consola", "archivos", "discord", "word", "youtube".' } }, required: ['appName'] }
    },
    ...getIntegrationDeclarations(),
    {
      name: 'execute_powershell',
      description: `Executes PowerShell commands on Windows. Use for system tasks, automation, and file management that can't be done with other tools.
WHEN TO USE:
• System info: IP address, disk space, RAM, OS version, hardware info
• Process management: kill process, start service, stop service
• File operations: batch rename, copy, delete multiple files, zip/unzip
• Network: ping, tracert, net commands, wifi info, DNS
• Registry: read/write registry keys
• Automation: scheduled tasks, environment variables, system settings
• Keyboard shortcuts: SendKeys (Ctrl+C, Alt+F4, Win+D, etc.)
• Windows features: enable/disable features, install/uninstall
• Scripts: run complex multi-line automation scripts

DO NOT USE for:
• Opening apps (use launch_app)
• Volume (use set_volume)
• Brightness (use set_brightness)
• Web search (use search_web)
• Weather (use get_weather)

EXAMPLES:
• Get IP: "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -ne 'Loopback*'} | Select-Object IPAddress"
• Disk space: "Get-PSDrive -PSProvider FileSystem | Format-Table"
• Send keys: "$wsh = New-Object -ComObject wscript.shell; $wsh.SendKeys('%{F4}')"`,
      parameters: { type: 'object', properties: { command: { type: 'string', description: 'PowerShell command or script to execute. Can be multi-line.' }, description: { type: 'string', description: 'Brief human-readable description of what this command does (shown to user).' } }, required: ['command', 'description'] }
    },
    {
      name: 'set_volume',
      description: 'Sets Windows master audio volume from 0 to 100. ALWAYS use this instead of PowerShell for volume control.',
      parameters: { type: 'object', properties: { percentage: { type: 'integer', description: 'Volume level 0-100. 0=mute, 50=half, 100=max.' } }, required: ['percentage'] }
    },
    {
      name: 'set_brightness',
      description: 'Sets screen brightness from 0 to 100. ALWAYS use this instead of PowerShell for brightness control.',
      parameters: { type: 'object', properties: { percentage: { type: 'integer', description: 'Brightness level 0-100.' } }, required: ['percentage'] }
    },
    {
      name: 'search_web',
      description: `INTERNAL RESEARCH — Searches the web and returns text results WITHOUT opening the browser.
USE THIS when you need to:
• Find information, answer questions, look something up
• Research topics, people, places, events
• Get current news, prices, sports scores
• Find definitions, explanations, how-to guides

The user says: "busca", "investiga", "qué es", "quién es", "cuánto cuesta", "busca información", "find", "search", "look up", "what is", "who is"

Returns structured text you can read and use in your response. Use fetch_url for deeper content from specific links.`,
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query in the most natural language for the topic.' }, engine: { type: 'string', description: 'Engine: "auto" (Google if configured, else DuckDuckGo, default), "wikipedia" (encyclopedic facts), "youtube" (find videos).' } }, required: ['query'] }
    },
    {
      name: 'open_browser',
      description: 'Opens a specific URL in the default browser. ONLY use when the user explicitly asks to open a website/URL. Do NOT use for research — use search_web. The user says: "abre [url]", "ve a [site]", "navega a", "open [site]".',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL (https://...)' }, reason: { type: 'string', description: 'Why we are opening this URL.' } }, required: ['url', 'reason'] }
    },
    {
      name: 'fetch_url',
      description: 'Fetches and reads the text content of any URL. Use to read articles, documentation, or extract data from web pages. Returns plain text (max 3000 chars).',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL (https://...)' }, reason: { type: 'string', description: 'Why fetching this URL.' } }, required: ['url', 'reason'] }
    },
    {
      name: 'show_notification',
      description: 'Shows a Windows system toast notification from Jarvis. Use for alerts, reminders, or confirmations the user should see even if Jarvis is minimized.',
      parameters: { type: 'object', properties: { title: { type: 'string', description: 'Notification title (short, max 64 chars).' }, body: { type: 'string', description: 'Notification body text.' } }, required: ['title', 'body'] }
    },
    {
      name: 'get_system_time',
      description: 'Gets the current system date, time, timezone, and day of week. Use when the user asks "qué hora es", "what time is it", "qué día es".',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'quick_note',
      description: 'Saves a quick note or reminder in persistent memory that persists across sessions. Use when the user says "anota", "recuerda esto", "guarda esta nota", "nota que", "save this".',
      parameters: { type: 'object', properties: { note: { type: 'string', description: 'Note or reminder text to save.' } }, required: ['note'] }
    },
    {
      name: 'remember_user_info',
      description: 'Stores or updates personal information about the user (name, preferences, interests, habits, location, work). IMPORTANT: Always include ALL previously known details plus the new info to avoid losing context.',
      parameters: { type: 'object', properties: { details: { type: 'string', description: 'Complete user profile including all known information.' } }, required: ['details'] }
    },
    {
      name: 'save_fact',
      description: 'Saves an important fact or piece of information about the user, their preferences, projects, or anything they want remembered long-term. Use when the user says "recuerda que", "guarda este dato", "importante saber que", "ten en cuenta que", "quiero que sepas". Facts persist across sessions.',
      parameters: { type: 'object', properties: { category: { type: 'string', description: 'Category like "personal", "work", "project", "preference", "health", "taste", "goal". Default: "general".' }, fact: { type: 'string', description: 'The fact or information to remember.' }, importance: { type: 'string', description: '"low", "normal", or "high". Default: "normal".' } }, required: ['fact'] }
    },
    {
      name: 'recall_facts',
      description: 'Retrieves previously saved facts from memory. Use when the user asks "qué sabes de", "recuerdas algo sobre", "qué guardé sobre", "dime qué sabes".',
      parameters: { type: 'object', properties: { category: { type: 'string', description: 'Filter by category (optional).' }, keyword: { type: 'string', description: 'Search keyword to filter facts (optional).' }, limit: { type: 'number', description: 'Max results to return. Default: 10.' } } }
    },
    {
      name: 'open_file',
      description: `Opens any file, folder, or drive using the default Windows application. Use for:
• Documents: PDF, DOCX, XLSX, images, videos, audio
• Folders: open a directory in File Explorer
• Drives: "D:\\\\" opens the drive
• Applications by path: "C:\\\\Program Files\\\\...\\\\app.exe"

DO NOT use for websites (use open_browser) or installed apps by name (use launch_app).`,
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Full path to the file, folder, or drive.' }, reason: { type: 'string', description: 'Why we are opening this.' } }, required: ['path', 'reason'] }
    },
    {
      name: 'get_weather',
      description: 'Gets current weather and forecast for any city. Returns temperature, conditions, humidity, wind speed. If user has a saved default city, it is used automatically.',
      parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name (e.g. "Buenos Aires", "Mexico City", "Madrid"). Omit to use saved default city.' }, forecast: { type: 'string', description: '"current" (default) for now, "3" for 3-day forecast, "7" for 7-day forecast.' } } }
    },
    {
      name: 'get_news',
      description: 'Gets the latest news headlines from Google News RSS. Returns up to 10 headlines with sources. Use when user asks about current events, noticias, news.',
      parameters: { type: 'object', properties: { topic: { type: 'string', description: 'News topic: "technology", "world", "sports", "science", "business", "entertainment", "health", "politics". Leave empty for top headlines.' } } }
    },
    {
      name: 'get_sports_news',
      description: 'Dedicated sports news tool. Gets the latest sports news and match results for specific sports (fútbol, NFL, NBA, F1, tenis, etc.) or competitions (World Cup, Champions League, Premier League, etc.). Returns 5-8 clean headlines with brief analysis. Never freezes — uses strict timeout and length limits.',
      parameters: { type: 'object', properties: {
        sport: { type: 'string', description: 'Sport or competition (e.g. "fútbol", "World Cup", "NFL", "NBA", "F1", "Champions League"). Leave empty for all sports.' }
      }, required: [] }
    },
    {
      name: 'deep_research',
      description: `Performs COMPREHENSIVE multi-source research on any topic. Uses multiple search engines to gather and compile information. Returns all findings in a structured report format.
USE when the user says: "investiga a fondo", "investiga", "averigua todo sobre", "dame información completa sobre", "investigate", "research", "tell me everything about", "deep dive into".
For simple lookups, use search_web instead.`,
      parameters: { type: 'object', properties: { topic: { type: 'string', description: 'Topic or question to research comprehensively.' }, depth: { type: 'string', description: '"quick" (fast, 1 source), "normal" (multiple sources, default), "deep" (all sources, most comprehensive).' } }, required: ['topic'] }
    },
    {
      name: 'file_operation',
      description: `Performs file system operations. Use for reading, writing, listing, moving, copying, or deleting files and folders.
OPERATIONS:
• list: List directory contents (path = directory)
• read: Read file content (path = file)
• write: Save content to file (path + content required)
• delete: Delete file or folder (path)
• move: Move/rename file (path = source, destination = target)
• copy: Copy file (path = source, destination = target)
• find: Search for files by pattern (path = search dir, pattern = e.g. "*.pdf")
• info: Get file size, date, type (path = file)`,
      parameters: { type: 'object', properties: {
        operation: { type: 'string', description: 'Operation: list, read, write, delete, move, copy, find, info.' },
        path: { type: 'string', description: 'Source path. Use %USERPROFILE%, %DESKTOP%, %DOCUMENTS% for common locations.' },
        content: { type: 'string', description: 'Content to write (for write operation).' },
        destination: { type: 'string', description: 'Destination path (for move/copy).' },
        pattern: { type: 'string', description: 'File pattern (for find): "*.txt", "*report*", "project*.js".' }
      }, required: ['operation', 'path'] }
    },
    {
      name: 'computer_action',
      description: `Performs keyboard, clipboard, and window control actions. Use for automation and UI control.
ACTIONS:
• type_text: Types text in the focused window (keys = text to type)
• press_keys: Sends key combination (Enter=~, Tab={TAB}, Esc={ESC}, F5={F5}, Ctrl+C=^c, Alt+F4=%{F4}, Win+D={LWIN}d, Ctrl+Z=^z, Ctrl+V=^v)
• clipboard_get: Gets current clipboard text content
• clipboard_set: Sets clipboard text (keys = text to copy)
• focus_window: Focuses a window by its title (windowTitle required)
• screenshot: Takes a screenshot, saves to Desktop

EXAMPLES:
• Close active window: action="press_keys", keys="%{F4}"
• Copy all: action="press_keys", keys="^a^c"
• Open Task Manager: action="press_keys", keys="^+{ESC}"
• Show Desktop: action="press_keys", keys="{LWIN}d"
• Minimize all: action="press_keys", keys="{LWIN}m"`,
      parameters: { type: 'object', properties: {
        action: { type: 'string', description: 'Action: type_text, press_keys, clipboard_get, clipboard_set, focus_window, screenshot.' },
        keys: { type: 'string', description: 'Keys or text for the action.' },
        windowTitle: { type: 'string', description: 'Window title to focus (for focus_window).' }
      }, required: ['action'] }
    },
    {
      name: 'youtube_action',
      description: 'Searches YouTube for a video and opens it in the browser. Use when user asks to find or watch a YouTube video.',
      parameters: { type: 'object', properties: { action: { type: 'string', description: '"search" (searches and opens first result), "info" (gets info from a YouTube URL).' }, query: { type: 'string', description: 'Search terms or YouTube URL.' } }, required: ['action', 'query'] }
    },
    {
      name: 'set_reminder',
      description: `Sets a Windows scheduled reminder that shows a notification at a specific time. Use when the user says "recuérdame", "pon un recordatorio", "avísame a las", "remind me".
Time formats: "in 30 minutes", "in 2 hours", "at 15:30", "tomorrow at 9:00", "2025-12-31T18:00".`,
      parameters: { type: 'object', properties: {
        reminder: { type: 'string', description: 'Reminder message text.' },
        time: { type: 'string', description: 'When: "in X minutes/hours", "at HH:MM", "tomorrow at HH:MM", or ISO datetime.' }
      }, required: ['reminder', 'time'] }
    },
    {
      name: 'set_timer',
      description: 'Sets a countdown timer. When it expires, shows a Windows notification. Use when user says "pon un temporizador de", "ponme X minutos", "set a timer".',
      parameters: { type: 'object', properties: {
        label: { type: 'string', description: 'Timer label (e.g. "Pasta", "Reunión", "Ejercicio").' },
        duration: { type: 'integer', description: 'Duration in seconds (60=1min, 300=5min, 600=10min, 1800=30min, 3600=1h).' }
      }, required: ['label', 'duration'] }
    },
    {
      name: 'desktop_action',
      description: 'Manages the Windows desktop: change wallpaper (via image URL or hex color), get system stats (CPU/RAM/disk).',
      parameters: { type: 'object', properties: {
        action: { type: 'string', description: '"wallpaper" (change wallpaper), "stats" (system CPU/RAM/disk info).' },
        value: { type: 'string', description: 'For wallpaper: image URL or hex color like "#1a1a2e".' }
      }, required: ['action'] }
    },
    {
      name: 'process_file',
      description: 'Extracts and reads text content from documents. Use to read PDFs, Word docs, Excel sheets, CSVs, images, ZIP archives.',
      parameters: { type: 'object', properties: {
        path: { type: 'string', description: 'Full path to the file.' },
        format: { type: 'string', description: 'File format if unclear from extension: pdf, docx, xlsx, csv, image, zip, text.' }
      }, required: ['path'] }
    },
    {
      name: 'translate_text',
      description: 'Translates text between languages. Use when user asks to translate words, phrases, or sentences.',
      parameters: { type: 'object', properties: {
        text: { type: 'string', description: 'Text to translate.' },
        targetLang: { type: 'string', description: 'Target language code: es (Spanish), en (English), fr (French), de (German), it (Italian), pt (Portuguese), ja (Japanese), zh (Chinese), ru (Russian). Default: es.' }
      }, required: ['text'] }
    },
    {
      name: 'list_processes',
      description: 'Lists or manages running Windows processes. Shows CPU and memory usage. Can filter by name or kill processes.',
      parameters: { type: 'object', properties: {
        action: { type: 'string', description: '"list" (top 20 by CPU, default), "filter" (search by name), "kill" (terminate by name or PID).' },
        name: { type: 'string', description: 'Process name for filter/kill (e.g. "chrome", "notepad").' },
        pid: { type: 'integer', description: 'Process ID to kill.' }
      }, required: ['action'] }
    },
    {
      name: 'system_stats',
      description: 'Gets real-time system health: CPU usage %, RAM used/total, disk space per drive, uptime, OS version. Use when user asks about computer performance.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'find_files',
      description: 'Searches for files and folders by name pattern. Returns path, size, and date. Use when user asks to find a file or folder.',
      parameters: { type: 'object', properties: {
        pattern: { type: 'string', description: 'Search pattern with wildcards: "*.pdf", "*.txt", "*informe*", "proyecto*.js", "*.mp4".' },
        path: { type: 'string', description: 'Directory to search. Default: Desktop and Documents.' },
        maxResults: { type: 'integer', description: 'Max results to return (default 20, max 50).' }
      }, required: ['pattern'] }
    },
    {
      name: 'youtube_download',
      description: 'Downloads a YouTube video or audio using yt-dlp. Saves to Desktop/JARVIS_Youtube folder.',
      parameters: { type: 'object', properties: {
        url: { type: 'string', description: 'Full YouTube URL or youtu.be short link.' },
        format: { type: 'string', description: '"video" (best quality mp4, default), "audio" (mp3 audio only), "custom" (specify format_code).' },
        format_code: { type: 'string', description: 'yt-dlp format code for custom downloads. Only used when format="custom".' }
      }, required: ['url'] }
    },
    {
      name: 'take_screenshot',
      description: `Captures a screenshot of the user's current screen and sends it to you for visual analysis.
WHEN TO USE:
• User asks "what's on my screen", "look at this", "what do you see", "analyze this image"
• User needs help with something visual on their screen
• User asks you to read something from their screen
• Any visual question about the current desktop or application
OUTPUT: You will receive the screenshot as an image. Describe what you see in detail.`,
      parameters: { type: 'object', properties: {
        description: { type: 'string', description: 'What the user wants you to look at or analyze on their screen. Be specific.' }
      }, required: ['description'] }
    },
    {
      name: 'edit_video',
      description: 'Edits a video file on the user\'s computer using FFmpeg. Supports trim (cortar), convert (convertir formato), extract_audio (extraer audio mp3), merge (unir videos), add_text (agregar texto), resize (cambiar resolución), speed (cambiar velocidad 0.25x-4x), compress (comprimir con CRF). REQUIRES ffmpeg installed.',
      parameters: { type: 'object', properties: {
        operation: { type: 'string', description: 'Operation: "trim", "convert", "extract_audio", "merge", "add_text", "resize", "speed", or "compress".' },
        input: { type: 'string', description: 'Full path to the input video file.' },
        output: { type: 'string', description: 'Full path for the output file (optional).' },
        start: { type: 'string', description: 'Trim start time (eg "0" or "00:01:30"). Default "0".' },
        end: { type: 'string', description: 'Trim end time (eg "00:02:00").' },
        duration: { type: 'string', description: 'Trim duration in seconds (eg "30").' },
        format: { type: 'string', description: 'Target format for convert (eg "mp4", "avi", "mov").' },
        audio_format: { type: 'string', description: 'Audio format for extract_audio (eg "mp3", "wav"). Default "mp3".' },
        files: { type: 'string', description: 'For merge: list of file paths separated by | (pipe).' },
        text: { type: 'string', description: 'Text to overlay on the video (for add_text).' },
        position: { type: 'string', description: 'Text position: "top", "bottom", "center". Default "bottom".' },
        font_size: { type: 'number', description: 'Font size for text overlay. Default 24.' },
        width: { type: 'number', description: 'Target width for resize. Default 1280.' },
        height: { type: 'number', description: 'Target height for resize. Default 720.' },
        speed: { type: 'number', description: 'Speed multiplier for speed operation (0.25 to 4). 2 = double speed.' },
        crf: { type: 'number', description: 'CRF value for compress (18-28, lower = better quality). Default 28.' }
      }, required: ['operation', 'input'] }
    },
  ];
}
