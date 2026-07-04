import { getFunctionDeclarations as getIntegrationDeclarations } from '../integrations/index.js';

export function getFunctionDeclarations() {
  return [
    {
      name: 'launch_app',
      description: 'Opens any Windows application or website. Use for: Chrome/navegador, Firefox, Edge, Spotify/música, VS Code, Discord, Steam, WhatsApp, Telegram, Calculator/calculadora, Notepad/bloc de notas, Paint, Terminal/consola, File Explorer/archivos, Settings/configuración, Word, Excel, PowerPoint, Task Manager/admin de tareas, YouTube, Gmail/correo, Maps/mapas, Netflix, Instagram, Twitter/X. ALWAYS try this tool first. Use Spanish app names too (e.g. "navegador" for Chrome, "música" for Spotify).',
      parameters: { type: 'object', properties: { appName: { type: 'string', description: 'App name in Spanish or English (e.g. "chrome", "navegador", "spotify", "música", "calculadora", "youtube", "correo", "archivos", "explorador", "consola", "discord", "word", "excel", "notas")' } }, required: ['appName'] }
    },
    ...getIntegrationDeclarations(),
    {
      name: 'search_web',
      description: 'INTERNAL RESEARCH: Searches the web and returns text results WITHOUT opening the browser. Uses DuckDuckGo, Wikipedia, and other free APIs to fetch structured information. Returns the content directly so you can read, analyze, and compile it into your response. NEVER open the browser for research — use this tool instead. Use when the user asks you to investigate, research, look up, search, find information, or learn about something. Call fetch_url on any result links for deeper content.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, engine: { type: 'string', description: 'Engine: duckduckgo (default, general search), wikipedia (encyclopedic), youtube (video search).' } }, required: ['query'] }
    },
    {
      name: 'open_browser',
      description: 'ONLY use when the user EXPLICITLY asks you to open a website/browser/URL in their browser. DO NOT use for research — use search_web instead. The user must literally say "abre [site]" or "open [site]".',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL to open (https://...)' }, reason: { type: 'string', description: 'Why we are opening this URL' } }, required: ['url', 'reason'] }
    },
    {
      name: 'execute_powershell',
      description: 'Executes PowerShell on Windows 11. Use for: system info (IP, disk, RAM, OS), process management, file operations, registry reads, keyboard shortcuts (SendKeys), system settings. Do NOT use to open apps (use launch_app instead). Do NOT use for volume (use set_volume) or brightness (use set_brightness).',
      parameters: { type: 'object', properties: { command: { type: 'string', description: 'PowerShell command to execute' }, description: { type: 'string', description: 'Brief description of what this command does' } }, required: ['command', 'description'] }
    },
    {
      name: 'set_volume',
      description: 'Sets Windows master audio volume from 0 to 100. Always use this tool (not PowerShell) for volume changes.',
      parameters: { type: 'object', properties: { percentage: { type: 'integer', description: 'Volume level 0-100' } }, required: ['percentage'] }
    },
    {
      name: 'set_brightness',
      description: 'Sets screen brightness from 0 to 100. Always use this tool (not PowerShell) for brightness changes.',
      parameters: { type: 'object', properties: { percentage: { type: 'integer', description: 'Brightness level 0-100' } }, required: ['percentage'] }
    },
    {
      name: 'fetch_url',
      description: 'Fetches the text content of a URL. Use to read articles, web pages, or extract data from sites. Returns plain text (max 3000 chars).',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL (https://...)' }, reason: { type: 'string', description: 'Why fetching this URL' } }, required: ['url', 'reason'] }
    },
    {
      name: 'show_notification',
      description: 'Shows a Windows system notification from Jarvis.',
      parameters: { type: 'object', properties: { title: { type: 'string', description: 'Notification title' }, body: { type: 'string', description: 'Notification body text' } }, required: ['title', 'body'] }
    },
    {
      name: 'get_system_time',
      description: 'Gets the current system date, time, timezone, and day of week.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'quick_note',
      description: 'Saves a quick note or reminder in persistent memory.',
      parameters: { type: 'object', properties: { note: { type: 'string', description: 'Note or reminder text to save' } }, required: ['note'] }
    },
    {
      name: 'remember_user_info',
      description: 'Stores personal information about the user (name, preferences, interests, habits). Include ALL previously known details plus the new information.',
      parameters: { type: 'object', properties: { details: { type: 'string', description: 'Everything known about the user' } }, required: ['details'] }
    },
    {
      name: 'open_file',
      description: 'Opens any file, document, folder, or drive on the system using the default Windows application. Use for: PDF, DOCX, images, videos, folders, drives (C:\), shortcuts, any file path. Also works with network paths. NOT for opening apps (use launch_app) or URLs (use open_browser).',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Full path to the file, folder, or drive (e.g. "C:\\Users\\...\\document.pdf", "D:\\", "C:\\Users")' }, reason: { type: 'string', description: 'Why we are opening this path' } }, required: ['path', 'reason'] }
    },
    {
      name: 'get_weather',
      description: 'Gets current weather and forecast for a city. Uses wttr.in (no API key needed). Returns temperature, conditions, humidity, wind. If the user has a default city configured, it will be used automatically; if the user asks for a different city, that becomes the new default.',
      parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name (e.g. "Mexico City", "Madrid", "Buenos Aires"). Optional — if omitted, the default city from config is used.' }, forecast: { type: 'string', description: 'forecast_days to get forecast (3 or 7 days) or "current" (default) for current weather' } } },
    },
    {
      name: 'get_news',
      description: 'Gets latest news headlines from a specific topic or general. Fetches from Google News RSS. Max 10 headlines.',
      parameters: { type: 'object', properties: { topic: { type: 'string', description: 'News topic/category (e.g. "technology", "world", "sports", "science", "business", "entertainment", "health") or empty for top stories' } }, required: [] }
    },
    {
      name: 'deep_research',
      description: 'Performs COMPREHENSIVE multi-source research on any topic. Uses multiple search engines and APIs to gather information, then returns ALL findings in a structured format. Best for complex questions requiring thorough investigation. Shows step-by-step research progress. Use this when the user says "investiga", "averigua", "investigate", "research", "what is", "who is", "tell me everything about", "deep dive".',
      parameters: { type: 'object', properties: { topic: { type: 'string', description: 'The topic or question to research deeply' }, depth: { type: 'string', description: 'Research depth: "quick" (single source, fast), "normal" (multiple sources, default), "deep" (all sources, comprehensive)' } }, required: ['topic'] }
    },
    {
      name: 'file_operation',
      description: 'Performs file and folder operations: list directory contents, read file content, write/save content to file, delete files/folders, move/rename, copy, search/find files by name, get file size/info. Works with any path on the system.',
      parameters: { type: 'object', properties: { operation: { type: 'string', description: 'Operation type: list, read, write, delete, move, copy, find, info' }, path: { type: 'string', description: 'Source path for the operation' }, content: { type: 'string', description: 'Content to write (required for write operation)' }, destination: { type: 'string', description: 'Destination path (required for move and copy operations)' }, pattern: { type: 'string', description: 'Search pattern (required for find operation, e.g. "*.txt", "*.js", "*report*")' } }, required: ['operation', 'path'] }
    },
    {
      name: 'computer_action',
      description: 'Performs keyboard and mouse actions: type text (SendKeys), press keys (Enter, Tab, Esc, F5, Win+D, etc.), clipboard get/set, focus a window by title. Uses PowerShell SendKeys and Win32 API.',
      parameters: { type: 'object', properties: { action: { type: 'string', description: 'Action type: type_text, press_keys, clipboard_get, clipboard_set, focus_window, screenshot' }, keys: { type: 'string', description: 'Keys to press (for press_keys). Enter=~, Tab={TAB}, Esc={ESC}, F5={F5}, Win={LWIN}, arrow keys={UP}{DOWN}{LEFT}{RIGHT}. Use + for Shift, ^ for Ctrl, % for Alt. For type_text: the text to type.' }, windowTitle: { type: 'string', description: 'Window title to focus (for focus_window action)' } }, required: ['action'] }
    },
    {
      name: 'youtube_action',
      description: 'Searches YouTube for a video and opens it in the browser, or gets video info. Does NOT download videos.',
      parameters: { type: 'object', properties: { action: { type: 'string', description: 'Action: search (searches and opens first result), info (gets video info from URL)' }, query: { type: 'string', description: 'Search query or YouTube URL' } }, required: ['action', 'query'] }
    },
    {
      name: 'set_reminder',
      description: 'Sets a timed reminder. Schedules a Windows task that shows a notification at the specified time. For simple notes use quick_note instead.',
      parameters: { type: 'object', properties: { reminder: { type: 'string', description: 'Reminder text/message' }, time: { type: 'string', description: 'When to remind. Can be: "in X minutes", "in X hours", "at HH:MM", "tomorrow at HH:MM", or an absolute datetime like "2025-12-31T18:00"' } }, required: ['reminder', 'time'] }
    },
    {
      name: 'desktop_action',
      description: 'Manages the Windows desktop: change wallpaper (via image URL or solid color), organize desktop files into folders, clean desktop (move all files into a dated folder), show system stats (CPU, RAM, disk, uptime).',
      parameters: { type: 'object', properties: { action: { type: 'string', description: 'Action: wallpaper (change desktop wallpaper), organize (group files into folders by type), clean (move all files to a date-stamped folder), stats (CPU/RAM/disk/uptime info)' }, value: { type: 'string', description: 'For wallpaper: URL to an image, or a hex color like "#1a1a2e". For organize/clean: optional target folder path.' } }, required: ['action'] }
    },
    {
      name: 'process_file',
      description: 'Extracts text content from documents: PDF, DOCX/DOC, XLSX/XLS, CSV, images (OCR via PowerShell), ZIP archives (list contents). Uses PowerShell and Windows built-in tools.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Full path to the file' }, format: { type: 'string', description: 'File format if not determinable from extension: pdf, docx, xlsx, csv, image, zip, text' } }, required: ['path'] }
    },
    {
      name: 'youtube_download',
      description: 'Downloads a YouTube video or audio to the user\'s Desktop/Downloads folder using yt-dlp. Supports: best quality video+audio (mp4), audio-only (mp3), custom format. Progress is shown in diagnostics. Videos go to a JARVIS_Youtube subfolder.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full YouTube URL (https://www.youtube.com/watch?v=...) or share link (https://youtu.be/...)' }, format: { type: 'string', description: 'Download format: "video" (best mp4, default), "audio" (best mp3 audio only), "custom" (specify via format_code)' }, format_code: { type: 'string', description: 'yt-dlp format code for custom downloads (e.g. "137+140" for best video+audio, "251" for opus audio). Only used when format="custom".' } }, required: ['url'] }
    },
    {
      name: 'translate_text',
      description: 'Translates text from any language to Spanish. Use for translating words, phrases, documents, or messages. Returns the translation with confidence.',
      parameters: { type: 'object', properties: { text: { type: 'string', description: 'Text to translate' }, targetLang: { type: 'string', description: 'Target language code (es=Spanish, en=English, fr=French, de=German, it=Italian, pt=Portuguese, ja=Japanese, zh=Chinese, ru=Russian). Default: es.' } }, required: ['text'] }
    },
    {
      name: 'list_processes',
      description: 'Lists running Windows processes with CPU and memory usage. Can filter by name or kill a process by PID or name.',
      parameters: { type: 'object', properties: { action: { type: 'string', description: 'Action: list (show top processes, default), filter (search by name), kill (terminate process)' }, name: { type: 'string', description: 'Process name to filter or kill (e.g. "notepad", "chrome"). Required for filter and kill actions.' }, pid: { type: 'integer', description: 'Process ID to kill (alternative to name for kill action)' } }, required: ['action'] }
    },
    {
      name: 'system_stats',
      description: 'Gets real-time system statistics: CPU usage percentage, RAM usage (used/total), disk usage per drive, uptime, OS version. Quick summary of system health.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'find_files',
      description: 'Searches for files and folders on the system by name pattern. Returns path, size, and last modified date. Searches recursively. Can limit results.',
      parameters: { type: 'object', properties: { pattern: { type: 'string', description: 'File name pattern to search for (supports wildcards: *.txt, *report*, project*.js)' }, path: { type: 'string', description: 'Directory to search in. Default: Desktop.' }, maxResults: { type: 'integer', description: 'Maximum results to return (default 20, max 50)' } }, required: ['pattern'] }
    },
    {
      name: 'set_timer',
      description: 'Sets a countdown timer. When time expires, shows a Windows notification. Can set multiple timers simultaneously.',
      parameters: { type: 'object', properties: { label: { type: 'string', description: 'Label for the timer (e.g. "Pasta", "Meeting", "Break")' }, duration: { type: 'integer', description: 'Duration in seconds (60 = 1 min, 300 = 5 min, 600 = 10 min, 3600 = 1 hour)' } }, required: ['label', 'duration'] }
    }
  ];
}
