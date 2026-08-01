import { getFunctionDeclarations as getIntegrationDeclarations } from '../engines/integration/index.js';
import { getFunctionDeclarations as getPlannerDeclarations } from '../engines/ai/planner/index.js';

export function getFunctionDeclarations() {
  return [
    {
      name: 'launch_app',
      description: `Opens any desktop application, program, or website. ONLY use when the user explicitly says to open an app (e.g. "abre Telegram", "abrí Spotify"). Do NOT use for casual conversation or greetings.
ALSO supports categories: "abrí un navegador", "abrí un juego", "abrí el editor de código", "abrí la música", "abrí el chat", "abrí diseño".
SUPPORTED (Spanish & English names work):
• Browsers: chrome/navegador/internet, firefox, edge, brave, opera
• Communication: discord/chat, whatsapp/wsp/wa, telegram/tg, signal, slack, teams, zoom
• Music/Media: spotify/música/vlc, obs/streaming, audacity, plex, kodi
• Productivity: notion, obsidian, trello, todoist/tareas, evernote
• Office: word/excel/powerpoint/ppt, outlook/correo, onenote, access
• Development: code/vscode/vs, cursor, windsurf, sublime, notepad++, postman, docker
• System: terminal/consola, cmd, powershell/shell, calculadora, paint, archivos/explorador, reloj
• Settings: settings/configuración/ajustes, administrador de tareas/task manager
• Social: instagram/ig, twitter/x, facebook/fb, tiktok, linkedin, reddit, pinterest
• Web: youtube/yt, gmail/correo, drive, maps/mapas, chatgpt/gpt, claude, netflix
• Gaming: steam, epic games, battle.net/blizzard, minecraft, origin, twitch, gog
• Design: photoshop/ps, illustrator/ai, figma/diseño, blender, premiere, after effects, lightroom
• Security: malwarebytes/antivirus, defender, bitwarden, nordvpn
• Utility: snipping tool/recortes, winrar/7zip, anydesk/escritorio remoto, powertoys
• Unknown app? Use list_installed_apps first to find the exact name, THEN call launch_app.`,
      parameters: { type: 'object', properties: { appName: { type: 'string', description: 'App name in Spanish or English. Use natural names like "navegador", "música", "calculadora", "correo", "consola", "archivos", "discord", "word", "youtube", "minecraft". Also supports categories: "un juego", "un navegador", "el editor de código".' } }, required: ['appName'] }
    },
    {
      name: 'create_prompt',
      description: `Creates a ready-to-copy prompt for the user to paste into another AI (ChatGPT, Claude, Gemini, Midjourney, etc.).
USE ONLY when the user explicitly asks to create/generate a prompt ("hazme un prompt para...", "creá un prompt...", "armame un prompt...").
Write the COMPLETE final prompt text yourself (as the user's message to the other AI, in the target language of that AI) and pass it in the prompt parameter.
The user will see it in the Prompts panel with a copy button — do NOT repeat the full prompt in your spoken reply, just explain briefly what it does.
Include direct web links only if they help the prompt (e.g. reference URLs); pass them in the links array.
Example: user says "hazme un prompt para ChatGPT que sea un resumen de mi documento" → title="Resumen de documento", prompt="Actúa como un analista senior...".`,
      parameters: { type: 'object', properties: {
        title: { type: 'string', description: 'Short title for the prompt (e.g. "Resumen de documento", "Prompt para editar fotos").' },
        prompt: { type: 'string', description: 'The complete prompt text, ready to copy and paste into another AI.' },
        links: { type: 'array', items: { type: 'string' }, description: 'Optional direct URLs to include with the prompt.' }
      }, required: ['prompt'] }
    },
    {
      name: 'list_installed_apps',
      description: `Lists all installed applications on Windows — Win32 programs, Microsoft Store/UWP apps, and Start Menu shortcuts. Use this when:
• User asks "qué apps tengo instaladas", "listá las aplicaciones", "mostrame los programas"
• User wants to know if a specific app is installed (use filter)
• Before calling launch_app for an unknown app, check if it exists first
Returns app names with their types (Win32, UWP, Shortcut, App).`,
      parameters: { type: 'object', properties: { filter: { type: 'string', description: 'Optional filter to search for specific apps by name (e.g. "minecraft", "chrome", "adobe"). Case insensitive.' } } }
    },
    {
      name: 'remember_app',
      description: `Teaches Jarvis a new application that isn't in the known list. Use when the user says "acordate de esta app", "aprendé esta aplicación", "guardá este programa". After saving, Jarvis will open it instantly next time.
Parameters: name (what to call it), path (full path to the .exe or shortcut). Example: name="mi programa", path="C:\\Tools\\myapp.exe"`,
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Short name to call the app (e.g. "mi programa", "editor especial").' }, path: { type: 'string', description: 'Full path to the executable or shortcut (e.g. "C:\\Program Files\\App\\app.exe").' } }, required: ['name', 'path'] }
    },
    {
      name: 'forget_app',
      description: 'Makes Jarvis forget a custom application that was previously saved with remember_app. Use when the user says "olvidá esta app", "borrá este programa".',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Name of the custom app to forget.' } }, required: ['name'] }
    },
    {
      name: 'list_user_apps',
      description: 'Lists all custom applications the user has taught Jarvis via remember_app. Use when the user asks "qué apps me guardaste", "mostrame mis programas guardados".',
      parameters: { type: 'object', properties: {} }
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
      name: 'clean_system',
      description: `Optimiza el sistema operativo: analiza y limpia archivos basura y temporales de forma segura.
ZONAS QUE LIMPIA:
• Temporales de usuario (%TEMP%)
• Temporales de Windows (C:\\Windows\\Temp)
• Caché de npm
• Papelera de reciclaje (se vacía)

CÓMO USARLO:
1. SIEMPRE llamá primero con mode="analyze" (solo mide el espacio recuperable, NO borra nada).
2. Contale al usuario cuánto espacio se puede liberar y PEDILE CONFIRMACIÓN.
3. Solo si el usuario confirma, llamá con mode="clean".

Usar cuando el usuario pide: "limpiá la PC", "optimizá el sistema", "limpiá archivos temporales/basura", "liberá espacio", "vacía la papelera", "clean the PC", "remove temp files".
NUNCA borres archivos personales (documentos, descargas, escritorio) — este tool solo toca temporales y cachés seguros.`,
      parameters: { type: 'object', properties: {
        mode: { type: 'string', description: '"analyze" (default): mide el espacio recuperable sin borrar nada. "clean": borra los archivos temporales, la caché de npm y vacía la papelera.' }
      }, required: [] }
    },
    {
      name: 'set_volume',
      description: 'Sets Windows master audio volume from 0 to 100. ALWAYS use this instead of PowerShell for volume control.',
      parameters: { type: 'object', properties: { percentage: { type: 'integer', description: 'Volume level 0-100. 0=mute, 50=half, 100=max.' } }, required: ['percentage'] }
    },
    {
      name: 'get_volume',
      description: 'Gets current Windows master audio volume level (0-100). Use when calculating relative adjustments or checking current volume.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'set_brightness',
      description: 'Sets screen brightness from 0 to 100. ALWAYS use this instead of PowerShell for brightness control.',
      parameters: { type: 'object', properties: { percentage: { type: 'integer', description: 'Brightness level 0-100.' } }, required: ['percentage'] }
    },
    {
      name: 'get_brightness',
      description: 'Gets current Windows screen brightness level (0-100). Use when calculating relative adjustments or checking current brightness.',
      parameters: { type: 'object', properties: {} }
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

Returns structured text you can read and use in your response. Use fetch_url for deeper content from specific links.
Backends tried in order: SerpAPI → Google Custom Search → Tavily AI → DuckDuckGo → Wikipedia → Google scrape.
BREVITY: When replying after a search, say ONLY what the user asked and ONLY what the search actually returned. No extra commentary, no filler, no repeated questions. Short answer (max 4 sentences or 6 bullets) + relevant links.

LINKS: When you reply, always include the most relevant links as clickable markdown links: [descripción breve](https://url-completa). NEVER type or read bare URLs aloud (they get distorted) — always wrap them in markdown [text](url). If the user asks for a link, give it exactly as shown in the search results.`,
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query in the most natural language for the topic.' }, engine: { type: 'string', description: 'Engine: "auto" (SerpAPI/Google/Tavily/DDG, default), "wikipedia" (encyclopedic facts), "youtube" (find videos).' } }, required: ['query'] }
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
      name: 'save_task',
      description: 'Saves a new task with status tracking. Use when the user says "recuerda esta tarea", "anotá que tengo que", "agendá", "no olvides que tengo que", "recordame que". Tasks persist with status (pending/completed) and can be organized by category (school, work, office, business, personal, study, health, project).',
      parameters: { type: 'object', properties: { title: { type: 'string', description: 'Task title (required).' }, category: { type: 'string', description: 'Category: "school", "work", "office", "business", "personal", "study", "health", "project", "general". Default: "general".' }, description: { type: 'string', description: 'Optional details about the task.' }, dueDate: { type: 'string', description: 'Due date like "2026-08-15", "next friday", "mañana", "next week".' }, priority: { type: 'string', description: '"low", "normal", or "high". Default: "normal".' } }, required: ['title'] }
    },
    {
      name: 'list_tasks',
      description: 'Lists saved tasks with optional filters. Use when the user asks "qué tareas tengo", "mostrame mis tareas", "qué me falta hacer", "decime mis pendientes".',
      parameters: { type: 'object', properties: { category: { type: 'string', description: 'Filter by category (optional): "school", "work", "office", "business", "personal", "study", "health", "project".' }, status: { type: 'string', description: 'Filter by status: "pending" or "completed". Default: all.' }, keyword: { type: 'string', description: 'Search keyword to filter tasks by title or description (optional).' } } }
    },
    {
      name: 'complete_task',
      description: 'Marks a task as completed. Use when the user says "terminé", "completé", "ya hice", "listo la tarea", "marcá como hecha".',
      parameters: { type: 'object', properties: { taskId: { type: 'string', description: 'Task ID to mark as completed. Get it from list_tasks first if unsure.' } }, required: ['taskId'] }
    },
    {
      name: 'delete_task',
      description: 'Permanently removes a task from memory. Use when the user says "eliminá esta tarea", "borrála", "no me interesa más".',
      parameters: { type: 'object', properties: { taskId: { type: 'string', description: 'Task ID to delete.' } }, required: ['taskId'] }
    },
    {
      name: 'save_research',
      description: 'Guarda un proyecto, investigación, análisis, o cualquier contenido largo como archivo .md persistente. IMPORTANTE: NO digas el contenido en voz — poné TODO el contenido en el parámetro "content". Usar cuando el usuario pide "guardá esto", "archivá este proyecto", "preservá este análisis". Se guarda en una carpeta organizada por categoría.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título descriptivo del proyecto. OBLIGATORIO: no lo dejes vacío. Ej: "Analisis Jarvis V3", "Guia de instalacion", "Proyecto X"' },
          content: { type: 'string', description: 'Contenido COMPLETO a guardar en Markdown. OBLIGATORIO: poné ACÁ todo el contenido, no lo digas en voz.' },
          category: { type: 'string', description: 'Categoría opcional (ej: "video", "code", "idea", "tutorial", "project"). Default: "general"' }
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'create_plan',
      description: 'Crea un plan estructurado con pasos y lo guarda permanentemente. Aparece en el panel Plan (icono en barra superior). Usar cuando el usuario pide "creá un plan", "armá un plan de acción", "planificame", "hacé un plan de 30 días". Recibí un título, objetivo general, y array de pasos.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título del plan. Ej: "Plan negocio digital Paraguay", "Plan 30 dias marketing"' },
          goal: { type: 'string', description: 'Objetivo general del plan' },
          steps: { type: 'array', items: { type: 'object', properties: { desc: { type: 'string', description: 'Descripción del paso' } }, required: ['desc'] }, description: 'Lista de pasos a seguir en orden' },
          category: { type: 'string', description: 'Categoría opcional (ej: "negocio", "marketing", "coding", "fitness"). Default: "general"' }
        },
        required: ['title', 'steps']
      }
    },
    {
      name: 'start_plan',
      description: 'Inicia la ejecución de un plan guardado. Reinicia la conversación y activa el MODO PLAN: el asistente ejecutará los pasos uno por uno automáticamente. Usar cuando el plan está listo y el usuario quiere ejecutarlo.',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID del plan a ejecutar' }
        },
        required: ['planId']
      }
    },
    {
      name: 'update_step',
      description: 'Actualiza el estado de un paso del plan. Llamar después de ejecutar cada paso para marcarlo como done o failed.',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID del plan' },
          stepIndex: { type: 'number', description: 'Índice del paso (0-based)' },
          status: { type: 'string', enum: ['done', 'failed', 'in_progress'], description: 'Nuevo estado del paso' },
          result: { type: 'string', description: 'Resultado opcional de la ejecución del paso' },
          error: { type: 'string', description: 'Error si el paso falló' }
        },
        required: ['planId', 'stepIndex', 'status']
      }
    },
    {
      name: 'update_plan',
      description: 'Modifica un plan existente durante la ejecución. Podés cambiar el título, objetivo, agregar/quitar/reordenar pasos, o ajustar cualquier detalle. El plan es totalmente flexible y se adapta a lo que el usuario necesite en el momento.',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID del plan a modificar' },
          title: { type: 'string', description: 'Nuevo título (opcional)' },
          goal: { type: 'string', description: 'Nuevo objetivo (opcional)' },
          steps: { type: 'array', items: { type: 'object', properties: { desc: { type: 'string', description: 'Descripción del paso' } }, required: ['desc'] }, description: 'Lista completa de pasos (reemplaza los anteriores). Incluí también los pasos ya completados para mantener el historial.' },
          category: { type: 'string', description: 'Nueva categoría (opcional)' }
        },
        required: ['planId']
      }
    },
    {
      name: 'exit_plan_mode',
      description: 'Sale del MODO PLAN y vuelve al modo normal de conversación. Llamar cuando todos los pasos del plan se completaron o cuando el usuario cancela la ejecución.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'analyze_path',
      description: `Analiza CUALQUIER archivo o carpeta en el sistema. Detecta el tipo de archivo al instante, lee su contenido si es texto, y muestra metadatos (tamaño, fecha). Para carpetas, lista TODO el contenido ordenado (numerado) con tipo de cada archivo. Usar cuando el usuario dice "analizá", "analizame esto", "qué hay aquí", "decime qué es este archivo", "listame los archivos de". NO usarlo para buscar contenido específico — usá search_documents para eso.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta completa del archivo o carpeta a analizar. Ej: "%USERPROFILE%\\Downloads", "%USERPROFILE%\\Documents\\archivo.pdf"' },
          deep: { type: 'boolean', description: 'Si es true, analiza subcarpetas también (máximo 2 niveles). Default: false' }
        },
        required: ['path']
      }
    },
    {
      name: 'search_documents',
      description: 'Busca en TODOS tus documentos locales (Documentos, Descargas, Escritorio) el contenido que coincida con una consulta. Lee archivos de texto y busca coincidencias relevantes. Útil para encontrar apuntes, información guardada, o cualquier contenido textual que hayas escrito. Usar cuando el usuario pregunta "buscame en mis documentos", "encontrá lo que habla sobre", "buscame información sobre", "dónde guardé lo de". Returns file names with the matching content snippets.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'The text to search for in your documents. Can be a word, phrase, or topic.' } }, required: ['query'] }
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
      name: 'analyze_page',
      description: `Opens any URL in a hidden browser, executes JavaScript, extracts ALL visible text content, and captures a screenshot for visual analysis. Use this to read full articles, documentation, or investigate any web page completely — including dynamic/SPA pages that need JavaScript. Returns up to 80K characters of text plus a screenshot.

USE THIS when the user says: "entra a esta página", "analiza esta web", "léeme este artículo", "qué dice esta página", "investiga esta URL", "scrapea esta página", "abre y lee", "get content from this URL", "read this page", "analyze this website".

For simple searches, use search_web. For existing links in search results, use fetch_url.`,
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL to analyze (https://...). Also accepts domain names without protocol.' }, reason: { type: 'string', description: 'Why we are analyzing this URL.' } }, required: ['url', 'reason'] }
    },
    {
      name: 'file_operation',
      description: `Performs file system operations. SMART summaries and full file management.
OPERATIONS:
• list/summary: Show SMART FOLDER SUMMARY — counts, folders, key files, sizes. Just pass path.
• read: Read file content (path = file)
• write: Save content to file (path + content required)
• delete: Delete CONTENTS of a folder (leaves folder empty), or delete a single file (path)
• delete_folder: Delete entire folder including the folder itself (path)
• move: Move/rename file (path = source, destination = target)
• copy: Copy file (path = source, destination = target)
• find/search: Search for files by name pattern (path = base dir, pattern = e.g. "*.pdf" or "report*")
• info: Get file size, date, type (path = file)
• folder/find_folder: Search ONLY folders by name (path = base dir, pattern = folder name)
• media/multimedia: Find media files (images/videos/audio). Requires path + mediaType("images","videos","audio","all")`,
      parameters: { type: 'object', properties: {
        operation: { type: 'string', description: 'Operation: list, summary, read, write, delete, move, copy, find, search, info, folder, find_folder, media, multimedia.' },
        path: { type: 'string', description: 'Source path. Use %USERPROFILE%, %DESKTOP%, %DOCUMENTS% for common locations.' },
        content: { type: 'string', description: 'Content to write (for write operation).' },
        destination: { type: 'string', description: 'Destination path (for move/copy).' },
        pattern: { type: 'string', description: 'File/folder pattern: "*.txt", "*report*", "project*.js".' },
        mediaType: { type: 'string', description: 'Media type for media operation: "images", "videos", "audio", "all".' },
        maxResults: { type: 'number', description: 'Max results for find/media (default 20-50).' }
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
      description: 'Manages the Windows desktop: change wallpaper (via local file path, image URL or hex color), get system stats (CPU/RAM/disk).',
      parameters: { type: 'object', properties: {
        action: { type: 'string', description: '"wallpaper" (change wallpaper), "stats" (system CPU/RAM/disk info).' },
        value: { type: 'string', description: 'For wallpaper: local file path, image URL or hex color like "#1a1a2e".' }
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
      description: 'Searches for files and folders by name pattern across your system. Returns found items with sizes and paths. Use for finding documents, media, any file. For focused media search use file_operation with operation="media".',
      parameters: { type: 'object', properties: {
        pattern: { type: 'string', description: 'Search pattern with wildcards: "*.pdf", "*.txt", "*informe*", "proyecto*.js", "*.mp4", "*foto*".' },
        path: { type: 'string', description: 'Directory to search. Default: User home folder.' },
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
      description: `Captures a screenshot of the user's current screen and analyzes it visually.
TOKEN COST: ALTA — cada captura gasta una cantidad significativa de tokens. SOLO usar cuando sea ESTRICTAMENTE necesario.

CUÁNDO USAR (SOLO estos casos):
• El usuario pide explícitamente: "mirá mi pantalla", "¿qué ves?", "tomá captura", "analizá esto", "SS"
• El usuario está siguiendo un tutorial y no sabe dónde hacer clic (GUJALO con pasos numerados)
• El usuario reporta un error visual que necesita verse para diagnosticar
• El usuario te pide ayuda con un programa específico y necesitás ver la interfaz

CUÁNDO NO USAR:
• Conversación casual o preguntas simples sin contexto visual
• "Por las dudas" o para enriquecer — solo si es ESENCIAL
• Lo que ya sabés sin ver la pantalla

ADVERTENCIA: Antes de llamar a esta herramienta, advertí al usuario que vas a tomar una captura y esperá su confirmación verbal.`,
      parameters: { type: 'object', properties: {
        question: { type: 'string', description: 'Specific question to answer about the screen. Default: describe everything visible.' }
      }, required: [] }
    },
    {
      name: 'analyze_screen',
      description: `Captures a screenshot and answers a specific question about it.
TOKEN COST: ALTA — igual que take_screenshot. Solo usar cuando sea esencial.

Usar en lugar de take_screenshot cuando necesitás una respuesta precisa (ej: "¿qué error aparece?", "¿cuál es el nombre del archivo?", "extraé el texto de la pantalla").

ADVERTENCIA: Antes de llamar a esta herramienta, advertí al usuario que vas a tomar una captura.`,
      parameters: { type: 'object', properties: {
        question: { type: 'string', description: 'The exact question to answer about the current screen content.' },
        prompt:   { type: 'string', description: 'Alternative field for the question/task.' }
      }, required: ['question'] }
    },
    {
      name: 'save_research',
      description: `Saves a completed research paper or academic work to the research system. Use AFTER calling deep_research or when the user asks to save research results.

Each research has PAGES (sections like introduction, development, conclusion, sources). The user can view, browse, and download them later from the Investigaciones button.

Parameters:
- topic: The research topic/title
- type: "academic" (colegio/universidad), "professional" (trabajo), "general" (default)
- pages: Array of { title, content } objects for each section
- sources: Array of source strings (optional)`,
      parameters: { type: 'object', properties: {
        topic: { type: 'string', description: 'Title or topic of the research paper.' },
        type: { type: 'string', description: 'Type: "academic", "professional", or "general". Default "academic".' },
        pages: { type: 'array', description: 'Array of page/section objects. Each has a title and content.', items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Section title (e.g. "Introducción", "Desarrollo", "Conclusión", "Fuentes").' },
            content: { type: 'string', description: 'Full content of the section in Spanish.' }
          },
          required: ['title', 'content']
        } },
        sources: { type: 'array', description: 'Array of source strings (optional).', items: { type: 'string' } }
      }, required: ['topic', 'pages'] }
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
    {
      name: 'organize_folder',
      description: `Organizes, inspects, and manages files in a folder.

MODES:
• preview  — Analyzes the folder and shows what would be organized. ALWAYS run this first before execute.
• execute  — Actually moves the files into categorized subfolders (only after user confirms preview).
• undo     — Reverts the last organization and restores all files to their original location.
• inspect  — READS the inside of a folder: lists all files, previews text/code/config file contents (up to 300 chars each), and groups binary files by type. Use this when the user wants to know WHAT IS INSIDE a folder (not just organize it).

WHEN TO USE:
• "organizá mis Descargas", "limpiá el Escritorio", "ordená la carpeta" → preview then execute
• "qué hay en esta carpeta", "leé los archivos de", "inspeccioná", "qué tiene adentro", "mostrame el contenido" → inspect
• "deshacé la organización" → undo

SUPPORTED PATHS (Spanish & English):
• "Descargas" / "Downloads" → Downloads folder
• "Escritorio" / "Desktop" → Desktop
• "Documentos" / "Documents" → Documents
• %USERPROFILE%, absolute paths, or relative descriptions

WORKFLOW (organize):
1. Call with mode="preview" → shows summary
2. Tell user what will happen and ask for confirmation
3. If confirmed, call with mode="execute"
4. Report results and mention undo is available`,
      parameters: { type: 'object', properties: {
        path: { type: 'string', description: 'Folder to organize or inspect. Examples: "Descargas", "Escritorio", "%USERPROFILE%\\Downloads", "%DESKTOP%". Spanish folder names (Descargas, Escritorio, Documentos) are resolved automatically.' },
        mode: { type: 'string', description: '"preview" (analyze only, default — ALWAYS run this first before execute), "execute" (actually move files, only after user confirms), "undo" (revert last organization), "inspect" (read file contents — use when user wants to see what is inside a folder).' },
        filter: { type: 'string', description: 'Optional file extension filter for inspect mode (e.g. "txt", "json", "py"). Omit to inspect all files.' }
      }, required: ['path'] }
    },
    {
      name: 'create_document',
      description: `Creates a document file of any format with structured content. Use when the user asks to create, write, or generate a document, report, PDF, essay, plan, guide, or any written file.

FORMATS SUPPORTED:
• pdf    — Professional PDF with cover page and styled sections (default)
• docx   — Word-compatible RTF document (opens in Word/LibreOffice)
• html   — Web page (HTML file)
• md     — Markdown file
• txt    — Plain text
• csv    — Spreadsheet data
• json   — JSON data file

IMPORTANT RULES FOR CONTENT GENERATION:
1. ALWAYS use real, researched information. If the topic requires facts, use search_web BEFORE calling this tool.
2. Each section must have UNIQUE and SUBSTANTIAL content — never repeat the same idea across sections.
3. Generate professional, well-organized content with personality and depth.
4. If the user asks for N pages/sections, create exactly N sections with genuinely different content.
5. Don't ask for confirmation — create the document directly.

WHEN TO USE:
• "creame un PDF de...", "escribí un documento sobre...", "generá un informe de...", "armame un plan en PDF"
• "hacé un ensayo sobre...", "escribí una guía de...", "creá un reporte de..."

savePath options: "Escritorio" (default), "Documentos", "Descargas", or absolute path.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title.' },
          format: { type: 'string', description: 'File format: "pdf" (default), "docx", "html", "md", "txt", "csv", "json".' },
          sections: {
            type: 'array',
            description: 'Array of document sections. Each section has a unique title and substantial content.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Section title.' },
                content: { type: 'string', description: 'Full section text. Write complete paragraphs, not bullet points or outlines. Be thorough and specific.' },
              },
              required: ['title', 'content'],
            },
          },
          filename: { type: 'string', description: 'Output filename without extension. Default: derived from title.' },
          savePath: { type: 'string', description: 'Where to save: "Escritorio" (default Desktop), "Documentos", "Descargas", or an absolute path.' },
          author: { type: 'string', description: 'Author name to show on cover page (optional).' },
          openAfter: { type: 'boolean', description: 'Open the file automatically after creation. Default: true.' },
        },
        required: ['title', 'sections'],
      },
    },
    ...getPlannerDeclarations(),

  ];
}
