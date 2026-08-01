import { executePowerShellCommand } from './powershell.js';
import { createLogger } from '../utils/logger.js';
import {
  launchApp as newLaunchApp,
  rebuildCatalog as launchRebuildCatalog,
  seedCatalogFromKnownApps,
  AppCatalog,
} from './app-launcher/index.js';
const _log = createLogger('APPS');

let appPathCache = {};
let userDefinedApps = {};
let _catalogSeeded = false;

async function _seedCatalog() {
  if (_catalogSeeded) return;
  _catalogSeeded = true;
  try {
    await seedCatalogFromKnownApps(KNOWN_APPS);
  } catch (e) {
    _log('warn', `Seed catalog error: ${e.message}`);
  }
}

export async function enableNewLauncher() {
  _log('info', 'Nuevo AppLauncher activado (siempre activo)');
  await _seedCatalog();
}

export function isNewLauncherEnabled() {
  return true;
}

const APP_CATEGORIES = {
  browser: 'Navegador',
  communication: 'Comunicación',
  productivity: 'Productividad',
  development: 'Desarrollo',
  gaming: 'Juegos',
  media: 'Multimedia',
  design: 'Diseño',
  system: 'Sistema',
  social: 'Social',
  web: 'Web',
  utility: 'Utilidades',
  security: 'Seguridad',
  office: 'Oficina'
};

const CATEGORY_ALIASES = {
  navegador: 'browser', navegadores: 'browser', browser: 'browser', browsers: 'browser', internet: 'browser', web: 'browser',
  comunicacion: 'communication', comunicación: 'communication', chat: 'communication', chat: 'communication', mensajes: 'communication', llamadas: 'communication', video: 'communication',
  productividad: 'productivity', productivity: 'productivity', trabajo: 'productivity', office: 'productivity', oficina: 'productivity',
  desarrollo: 'development', development: 'development', dev: 'development', programacion: 'development', programación: 'development', codigo: 'development', código: 'development', ide: 'development',
  juegos: 'gaming', gaming: 'gaming', game: 'gaming', games: 'gaming', jugar: 'gaming', videojuegos: 'gaming',
  musica: 'media', música: 'media', multimedia: 'media', media: 'media', video: 'media', videos: 'media', audio: 'media', reproductor: 'media', fotos: 'media',
  diseño: 'design', design: 'design', diseno: 'design', grafico: 'design', gráfico: 'design', editar: 'design',
  sistema: 'system', system: 'system', herramientas: 'system', herramienta: 'system', configuracion: 'system', configuración: 'system',
  social: 'social', redes: 'social', red: 'social',
  utilidades: 'utility', utilities: 'utility', util: 'utility', herramienta: 'utility',
  seguridad: 'security', security: 'security', antivirus: 'security', proteccion: 'security', protección: 'security',
  oficina: 'office', office: 'office', documentos: 'office', documentacion: 'office', documentación: 'office'
};

const KNOWN_APPS = {
  chrome:        { exe: 'chrome.exe',          url: 'https://google.com',         category: 'browser',      names: ['chrome', 'google chrome', 'navegador', 'explorador web', 'browser', 'internet', 'web', 'buscador', 'google', 'chromium'] },
  firefox:       { exe: 'firefox.exe',         url: 'https://google.com',         category: 'browser',      names: ['firefox', 'mozilla firefox', 'mozilla', 'zorro de fuego'] },
  edge:          { exe: 'msedge.exe',          url: 'https://google.com',         category: 'browser',      names: ['edge', 'microsoft edge', 'ms edge'] },
  brave:         { exe: 'brave.exe',           url: 'https://google.com',         category: 'browser',      names: ['brave', 'brave browser'] },
  opera:         { exe: 'opera.exe',           url: 'https://opera.com',          category: 'browser',      names: ['opera', 'opera browser', 'opera gx'] },
  spotify:       { exe: 'Spotify.exe',         url: 'https://open.spotify.com',   category: 'media',        names: ['spotify', 'musica', 'música', 'spoti', 'spotify music', 'reproductor musica'] },
  code:          { exe: 'Code.exe',            url: null,                          category: 'development',  names: ['code', 'vs code', 'visual studio code', 'vscode', 'codigo', 'código', 'vs', 'editor de codigo', 'editor de código'] },
  discord:       { exe: 'Discord.exe',         url: 'https://discord.com/app',    category: 'communication', names: ['discord', 'disc', 'discor', 'discord app'] },
  steam:         { exe: 'steam.exe',           url: null,                          category: 'gaming',       names: ['steam', 'juegos', 'steam games', 'plataforma juegos'] },
  whatsapp:      { exe: 'WhatsApp.exe',        url: 'https://web.whatsapp.com',   category: 'communication', names: ['whatsapp', 'whats app', 'wsp', 'wasap', 'whats', 'wa'] },
  telegram:      { exe: 'Telegram.exe',        url: 'https://web.telegram.org',   category: 'communication', names: ['telegram', 'telégram', 'tg'] },
  signal:        { exe: 'signal.exe',          url: 'https://signal.org',         category: 'communication', names: ['signal', 'signal app', 'signal messenger'] },
  slack:         { exe: 'slack.exe',           url: 'https://slack.com',          category: 'communication', names: ['slack'] },
  zoom:          { exe: 'Zoom.exe',            url: 'https://zoom.us',            category: 'communication', names: ['zoom', 'zoom meetings', 'videollamada', 'reunion zoom'] },
  calculator:    { exe: 'calc.exe',            url: null,                          category: 'utility',      names: ['calculadora', 'calculator', 'calc', 'calcular', 'calcula'] },
  notepad:       { exe: 'notepad.exe',         url: null,                          category: 'utility',      names: ['notepad', 'bloc de notas', 'block de notas', 'notas', 'nota', 'editor de texto'] },
  paint:         { exe: 'mspaint.exe',         url: null,                          category: 'design',       names: ['paint', 'mspaint', 'dibujo', 'pintura', 'ms paint'] },
  terminal:      { exe: 'WindowsTerminal.exe', url: null,                          category: 'system',       names: ['terminal', 'windows terminal', 'consola', 'wt', 'cmd terminal'] },
  cmd:           { exe: 'cmd.exe',             url: null,                          category: 'system',       names: ['cmd', 'simbolo del sistema', 'command prompt', 'simbolo sistema', 'símbolo del sistema'] },
  powershell:    { exe: 'powershell.exe',      url: null,                          category: 'system',       names: ['powershell', 'power shell', 'pwsh', 'shell'] },
  explorer:      { exe: 'explorer.exe',        url: null,                          category: 'system',       names: ['explorer', 'file explorer', 'windows explorer', 'archivos', 'explorador', 'explorador de archivos', 'mis archivos', 'mis documentos', 'explorador archivos'] },
  settings:      { exe: null,                  url: 'ms-settings:',               category: 'system',       names: ['settings', 'configuracion', 'ajustes', 'configuración', 'opciones', 'preferencias', 'windows settings'] },
  taskmanager:   { exe: 'taskmgr.exe',         url: null,                          category: 'system',       names: ['task manager', 'administrador de tareas', 'taskmanager', 'admin tareas', 'procesos', 'monitor', 'admin procesos'] },
  control:       { exe: 'control',             url: null,                          category: 'system',       names: ['control panel', 'panel de control', 'control'] },
  word:          { exe: 'WINWORD.EXE',         url: null,                          category: 'office',       names: ['word', 'microsoft word', 'microsoftword', 'documento word', 'procesador texto'] },
  excel:         { exe: 'EXCEL.EXE',           url: null,                          category: 'office',       names: ['excel', 'microsoft excel', 'microsoftexcel', 'hoja de calculo', 'hoja de cálculo', 'planilla', 'planilla calculo'] },
  powerpoint:    { exe: 'POWERPNT.EXE',        url: null,                          category: 'office',       names: ['powerpoint', 'microsoft powerpoint', 'ppt', 'presentaciones', 'presentacion', 'presentación', 'slides'] },
  access:        { exe: 'MSACCESS.EXE',        url: null,                          category: 'office',       names: ['access', 'microsoft access', 'base de datos', 'bd'] },
  onenote:       { exe: 'ONENOTE.EXE',         url: null,                          category: 'office',       names: ['onenote', 'one note', 'notas microsoft'] },
  outlook:       { exe: 'OUTLOOK.EXE',         url: 'https://outlook.live.com',    category: 'office',       names: ['outlook', 'correo outlook', 'microsoft outlook'] },
  youtube:       { exe: null,                  url: 'https://youtube.com',         category: 'web',          names: ['youtube', 'yt', 'you tube', 'videos', 'tube', 'youtube videos'] },
  gmail:         { exe: null,                  url: 'https://gmail.com',           category: 'web',          names: ['gmail', 'correo gmail', 'mail', 'correo', 'email', 'correo electronico', 'correo electrónico'] },
  maps:          { exe: null,                  url: 'https://maps.google.com',     category: 'web',          names: ['maps', 'google maps', 'mapas', 'mapa', 'google map'] },
  drive:         { exe: null,                  url: 'https://drive.google.com',    category: 'web',          names: ['drive', 'google drive', 'google docs'] },
  netflix:       { exe: null,                  url: 'https://netflix.com',         category: 'web',          names: ['netflix', 'peliculas', 'películas', 'series netflix', 'streaming'] },
  instagram:     { exe: null,                  url: 'https://instagram.com',       category: 'social',       names: ['instagram', 'ig', 'insta', 'fotos'] },
  twitter:       { exe: null,                  url: 'https://twitter.com',         category: 'social',       names: ['twitter', 'x', 'x.com', 'twt'] },
  facebook:      { exe: null,                  url: 'https://facebook.com',        category: 'social',       names: ['facebook', 'fb', 'face'] },
  chatgpt:       { exe: null,                  url: 'https://chat.openai.com',     category: 'web',          names: ['chatgpt', 'openai', 'gpt', 'chat gpt', 'chat openai'] },
  claude:        { exe: null,                  url: 'https://claude.ai',           category: 'web',          names: ['claude', 'claude ai', 'anthropic'] },
  gemini:        { exe: null,                  url: 'https://gemini.google.com',   category: 'web',          names: ['gemini', 'google gemini', 'bard'] },
  copilot:       { exe: null,                  url: 'https://copilot.microsoft.com', category: 'web',        names: ['copilot', 'microsoft copilot'] },
  obs:           { exe: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe', url: null, category: 'media',        names: ['obs', 'obs studio', 'open broadcaster', 'streaming', 'stream', 'grabar pantalla', 'grabacion', 'grabación', 'streamlabs'] },
  vlc:           { exe: 'vlc.exe',             url: null,                          category: 'media',        names: ['vlc', 'vlc media player', 'reproductor', 'reproductor de video', 'media player', 'reproductor video'] },
  photoshop:     { exe: 'Photoshop.exe',       url: null,                          category: 'design',       names: ['photoshop', 'ps', 'adobe photoshop', 'fotos editor', 'editor de fotos', 'editar fotos'] },
  illustrator:   { exe: 'Illustrator.exe',     url: null,                          category: 'design',       names: ['illustrator', 'ai', 'adobe illustrator', 'ilustrador', 'dibujo vectorial'] },
  premiere:      { exe: 'Adobe Premiere Pro.exe', url: null,                      category: 'design',       names: ['premiere', 'adobe premiere', 'premiere pro', 'editor video', 'editar video'] },
  aftereffects:  { exe: 'AfterFX.exe',         url: null,                          category: 'design',       names: ['after effects', 'ae', 'adobe after effects', 'efectos visuales', 'motion graphics'] },
  lightroom:     { exe: 'Lightroom.exe',       url: null,                          category: 'design',       names: ['lightroom', 'adobe lightroom', 'editar fotos', 'revelado'] },
  figma:         { exe: 'Figma.exe',           url: 'https://figma.com',           category: 'design',       names: ['figma', 'figma desktop', 'diseño', 'diseno', 'ui design', 'ux design', 'diseño web'] },
  unity:         { exe: 'Unity.exe',           url: null,                          category: 'development',  names: ['unity', 'unity hub', 'unity editor', 'motor de juego'] },
  unreal:        { exe: 'UnrealEditor.exe',    url: null,                          category: 'development',  names: ['unreal', 'unreal engine', 'ue5', 'unreal editor', 'motor grafico'] },
  blender:       { exe: 'blender.exe',         url: null,                          category: 'design',       names: ['blender', 'blender 3d', 'modelado 3d', 'animacion 3d', 'animación 3d'] },
  teams:         { exe: 'ms-teams.exe',        url: 'https://teams.microsoft.com', category: 'communication', names: ['teams', 'microsoft teams', 'ms teams', 'reuniones', 'reunion'] },
  notepadpp:     { exe: 'notepad++.exe',       url: null,                          category: 'development',  names: ['notepad++', 'notepad plus', 'notepadpp', 'npp', 'editor codigo'] },
  sublime:       { exe: 'sublime_text.exe',    url: null,                          category: 'development',  names: ['sublime', 'sublime text', 'sublime editor'] },
  atom:          { exe: 'atom.exe',            url: null,                          category: 'development',  names: ['atom', 'atom editor', 'github atom'] },
  winrar:        { exe: 'WinRAR.exe',          url: null,                          category: 'utility',      names: ['winrar', 'win rar', 'rar', 'compresor', 'descompresor'] },
  _7zip:         { exe: '7zFM.exe',            url: null,                          category: 'utility',      names: ['7zip', '7-zip', '7z', 'siete zip'] },
  winzip:        { exe: 'winzip64.exe',        url: null,                          category: 'utility',      names: ['winzip', 'win zip', 'zip'] },
  cursor:        { exe: 'cursor.exe',          url: null,                          category: 'development',  names: ['cursor', 'cursor editor', 'cursor ai', 'cursor ide'] },
  windsurf:      { exe: 'windsurf.exe',        url: null,                          category: 'development',  names: ['windsurf', 'windsurf ide', 'windsurf editor'] },
  gitbash:       { exe: 'C:\\Program Files\\Git\\git-bash.exe', url: null,        category: 'development',  names: ['git bash', 'gitbash', 'bash git', 'git'] },
  gitgui:        { exe: 'git-gui.exe',          url: null,                          category: 'development',  names: ['git gui'] },
  gitk:          { exe: 'gitk.exe',             url: null,                          category: 'development',  names: ['gitk'] },
  postman:       { exe: 'Postman.exe',         url: null,                          category: 'development',  names: ['postman', 'api test', 'postman app', 'api client'] },
  docker:        { exe: 'Docker Desktop.exe',  url: null,                          category: 'development',  names: ['docker', 'docker desktop', 'contenedores'] },
  telegram_web:  { exe: null,                  url: 'https://web.telegram.org',    category: 'web',          names: ['telegram web'] },
  tiktok:        { exe: null,                  url: 'https://tiktok.com',          category: 'social',       names: ['tiktok', 'tik tok'] },
  linkedin:      { exe: null,                  url: 'https://linkedin.com',        category: 'social',       names: ['linkedin', 'linked in'] },
  github:        { exe: null,                  url: 'https://github.com',          category: 'web',          names: ['github', 'git hub', 'gh'] },
  clock:         { exe: null,                  url: 'ms-clock:',                   category: 'system',       names: ['reloj', 'clock', 'alarma', 'cronometro', 'cronómetro', 'timer windows', 'temporizador windows'] },
  snipping:      { exe: 'SnippingTool.exe',    url: null,                          category: 'utility',      names: ['snipping tool', 'recortes', 'captura de pantalla', 'recortador', 'screenshot tool', 'recorte anotacion'] },
  store:         { exe: null,                  url: 'ms-windows-store:',           category: 'system',       names: ['store', 'tienda windows', 'microsoft store', 'windows store', 'tienda'] },
  camera:        { exe: null,                  url: 'microsoft.windows.camera:',   category: 'system',       names: ['camera', 'camara', 'cámara', 'webcam'] },
  photos:        { exe: null,                  url: 'ms-photos:',                  category: 'system',       names: ['photos', 'fotos', 'galeria', 'galería', 'visor de fotos'] },
  maps_uwp:      { exe: null,                  url: 'bingmaps:',                   category: 'system',       names: ['bing maps', 'mapas windows'] },
  malwarebytes:  { exe: 'mbam.exe',            url: null,                          category: 'security',     names: ['malwarebytes', 'antivirus', 'anti virus'] },
  defender:      { exe: null,                  url: 'windowsdefender:',            category: 'security',     names: ['defender', 'windows defender', 'windows security', 'seguridad windows'] },
  notion:        { exe: 'Notion.exe',          url: 'https://notion.so',           category: 'productivity', names: ['notion', 'notion app'] },
  trello:        { exe: null,                  url: 'https://trello.com',          category: 'productivity', names: ['trello'] },
  asana:         { exe: null,                  url: 'https://asana.com',           category: 'productivity', names: ['asana', 'gestion proyectos', 'gestión proyectos'] },
  todoist:       { exe: null,                  url: 'https://todoist.com',         category: 'productivity', names: ['todoist', 'tareas', 'pendientes', 'lista tareas'] },
  evernote:      { exe: 'Evernote.exe',        url: 'https://evernote.com',        category: 'productivity', names: ['evernote', 'notas'] },
  plex:          { exe: 'Plex.exe',            url: null,                          category: 'media',        names: ['plex', 'plex media', 'media server', 'servidor multimedia'] },
  kodi:          { exe: 'kodi.exe',            url: null,                          category: 'media',        names: ['kodi', 'kodi media', 'centro multimedia'] },
  xbox:          { exe: null,                  url: 'xbox:',                        category: 'gaming',       names: ['xbox', 'xbox app', 'xbox game pass', 'game pass', 'xbox console companion'] },
  epicgames:     { exe: 'EpicGamesLauncher.exe', url: null,                        category: 'gaming',       names: ['epic games', 'epic', 'epic launcher', 'fortnite launcher'] },
  minecraft:     { exe: 'MinecraftLauncher.exe', url: null,                        category: 'gaming',       names: ['minecraft', 'mine craft', 'mc', 'minecraft launcher', 'launcher de minecraft'] },
  origin:        { exe: 'Origin.exe',          url: null,                          category: 'gaming',       names: ['origin', 'ea origin', 'ea games'] },
  battlenet:     { exe: 'Battle.net.exe',      url: null,                          category: 'gaming',       names: ['battle.net', 'blizzard', 'battlenet', 'wow', 'overwatch', 'diablo'] },
  gog:           { exe: 'GalaxyClient.exe',    url: null,                          category: 'gaming',       names: ['gog', 'gog galaxy', 'good old games'] },
  discord_canje: { exe: null,                  url: 'https://discord.com/app',    category: 'communication', names: ['canje', 'discord canje', 'nitro'] },
  twitch:        { exe: 'Twitch.exe',          url: 'https://twitch.tv',           category: 'gaming',       names: ['twitch', 'live', 'streaming'] },
  spotube:       { exe: 'spotube.exe',         url: null,                          category: 'media',        names: ['spotube', 'musica gratis'] },
  audacity:      { exe: 'audacity.exe',        url: null,                          category: 'media',        names: ['audacity', 'editor audio', 'grabacion audio', 'grabar audio', 'editar audio'] },
  davinci:       { exe: 'DaVinci_Resolve.exe', url: null,                          category: 'media',        names: ['davinci', 'davinci resolve', 'resolve', 'editor video profesional'] },
  bitwarden:     { exe: 'Bitwarden.exe',       url: 'https://vault.bitwarden.com', category: 'security',     names: ['bitwarden', 'gestor contraseñas', 'password manager'] },
  keepass:       { exe: 'KeePass.exe',         url: null,                          category: 'security',     names: ['keepass', 'keepassxc', 'kee pass', 'password safe'] },
  nordvpn:       { exe: 'NordVPN.exe',         url: null,                          category: 'security',     names: ['nordvpn', 'nord vpn', 'vpn'] },
  cloudflare:    { exe: null,                  url: 'https://one.one.one.one',     category: 'security',     names: ['cloudflare', 'warp', '1.1.1.1', 'cloudflare vpn'] },
  logseq:        { exe: 'Logseq.exe',          url: null,                          category: 'productivity', names: ['logseq', 'knowledge graph', 'notas grafo'] },
  anydesk:       { exe: 'AnyDesk.exe',         url: null,                          category: 'utility',      names: ['anydesk', 'escritorio remoto', 'remote desktop', 'control remoto'] },
  teamviewer:    { exe: 'TeamViewer.exe',      url: null,                          category: 'utility',      names: ['teamviewer', 'team viewer', 'escritorio remoto'] },
  powertoys:     { exe: 'PowerToys.exe',       url: null,                          category: 'utility',      names: ['powertoys', 'power toys', 'microsoft powertoys'] },
  obsidian:      { exe: 'Obsidian.exe',        url: null,                          category: 'productivity', names: ['obsidian', 'notas obsidian', 'toma notas', 'knowledge base'] },
  wsl:           { exe: 'wsl.exe',             url: null,                          category: 'development',  names: ['wsl', 'windows subsystem linux', 'linux', 'ubuntu', 'bash'] },
  nodejs:        { exe: 'node.exe',            url: null,                          category: 'development',  names: ['node', 'nodejs', 'node js', 'npm', 'npx'] },
  python:        { exe: 'python.exe',          url: null,                          category: 'development',  names: ['python', 'python3', 'py'] },
  mongodb:       { exe: 'mongod.exe',          url: null,                          category: 'development',  names: ['mongo', 'mongodb', 'mongod', 'base datos mongo'] },
  mysql:         { exe: 'mysql.exe',           url: null,                          category: 'development',  names: ['mysql', 'sql', 'base datos mysql', 'mariadb'] },
  tableplus:     { exe: 'TablePlus.exe',       url: null,                          category: 'development',  names: ['tableplus', 'table plus', 'gestor bd', 'gestor base datos'] },
  insomnia:      { exe: 'Insomnia.exe',        url: null,                          category: 'development',  names: ['insomnia', 'api client', 'rest client', 'graphql'] },
  termius:       { exe: 'Termius.exe',         url: null,                          category: 'development',  names: ['termius', 'ssh client', 'ssh'] },
  filezilla:     { exe: 'filezilla.exe',       url: null,                          category: 'utility',      names: ['filezilla', 'ftp', 'sftp', 'cliente ftp'] },
  qbittorrent:   { exe: 'qbittorrent.exe',     url: null,                          category: 'media',        names: ['qbittorrent', 'qbit', 'torrent', 'bittorrent', 'descargas'] },
  utorrent:      { exe: 'utorrent.exe',        url: null,                          category: 'media',        names: ['utorrent', 'u torrent', 'torrent', 'bittorrent'] },
  spotify_web:   { exe: null,                  url: 'https://open.spotify.com',    category: 'web',          names: ['spotify web', 'spotify navegador'] },
  whatsapp_web:  { exe: null,                  url: 'https://web.whatsapp.com',    category: 'web',          names: ['whatsapp web', 'wsp web'] },
  deepseek:      { exe: null,                  url: 'https://chat.deepseek.com',   category: 'web',          names: ['deepseek', 'deep seek', 'chat deepseek'] },
  perplexity:    { exe: null,                  url: 'https://perplexity.ai',       category: 'web',          names: ['perplexity', 'ai search', 'buscador ai'] },
  huggingface:   { exe: null,                  url: 'https://huggingface.co',      category: 'web',          names: ['hugging face', 'huggingface', 'hf'] },
  stackoverflow: { exe: null,                  url: 'https://stackoverflow.com',   category: 'web',          names: ['stack overflow', 'stackoverflow', 'so'] },
  reddit:        { exe: null,                  url: 'https://reddit.com',          category: 'social',       names: ['reddit', 'redit'] },
  pinterest:     { exe: null,                  url: 'https://pinterest.com',       category: 'social',       names: ['pinterest', 'pinteres'] },
};

const PLATFORM_APPS = {
  darwin: {
    chrome: ['Google Chrome', 'Brave Browser', 'Safari', 'Firefox'],
    terminal: ['Terminal', 'iTerm', 'Warp'],
    spotify: ['Spotify'],
    code: ['Visual Studio Code', 'Cursor'],
    calculator: ['Calculator'],
    notepad: ['TextEdit'],
    explorer: ['Finder'],
    settings: ['System Settings', 'System Preferences']
  },
  linux: {
    chrome: ['google-chrome', 'firefox', 'chromium-browser', 'brave-browser'],
    terminal: ['gnome-terminal', 'xterm', 'konsole', 'xfce4-terminal', 'warp-terminal'],
    spotify: ['spotify'],
    code: ['code', 'cursor'],
    calculator: ['gnome-calculator', 'kcalc', 'qalculate-gtk'],
    notepad: ['gedit', 'nano', 'kate', 'mousepad'],
    explorer: ['nautilus', 'dolphin', 'thunar', 'nemo']
  }
};

const CUSTOM_APPS_KEY = 'jarvis_custom_apps';

function _isHttpUrl(str) {
  return /^https?:\/\//i.test(str);
}

function _isMsUri(str) {
  return /^ms-/.test(str);
}

function _getCategoryFromAlias(term) {
  const norm = _normalize(term);
  for (const [alias, category] of Object.entries(CATEGORY_ALIASES)) {
    if (norm === alias || norm.includes(alias) || alias.includes(norm)) return category;
  }
  return null;
}

function _appsByCategory(category) {
  const results = [];
  for (const [key, app] of Object.entries(KNOWN_APPS)) {
    if (app.category === category) results.push({ key, ...app });
  }
  return results;
}

export async function scanAllInstalledApps() {
  _log('info', 'Escaneando todas las apps instaladas...');
  try {
    const parsed = await window.electronAPI.scanApps();
    if (!parsed || typeof parsed !== 'object') return 0;
    let count = 0;
    Object.keys(parsed).forEach(k => {
      const v = (parsed[k] || '').trim();
      if (v && !appPathCache[k]) {
        appPathCache[k] = v;
        count++;
      }
    });
    _log('info', `Scan completado: ${count} apps nuevas (total: ${Object.keys(appPathCache).length})`);
    try {
      // Merge en el catálogo nuevo: UWP → app_id, .lnk → shortcut, resto → executable
      const { default: AppCatalog } = await import('./app-launcher/AppCatalog.js');
      const catalog = AppCatalog.getInstance();
      await catalog.load();
      let added = 0;
      for (const [name, path] of Object.entries(parsed)) {
        const v = (path || '').trim();
        if (!v || !name) continue;
        if (v.startsWith('shell:AppsFolder\\')) {
          const appId = v.replace('shell:AppsFolder\\', '');
          if (catalog.add({ name, path: appId, appId, type: 'app_id', source: 'scan' })) added++;
        } else if (v.toLowerCase().endsWith('.lnk')) {
          if (catalog.add({ name, path: v, type: 'shortcut', source: 'scan' })) added++;
        } else {
          if (catalog.add({ name, path: v, type: 'executable', source: 'scan' })) added++;
        }
      }
      if (added > 0) {
        await catalog.save();
        _log('info', `Scan merge: ${added} apps añadidas al catálogo (${catalog.count()} total)`);
      }
    } catch (e) { _log('warn', `scan merge catalog: ${e.message}`); }
    try {
      const memory = await window.electronAPI.memoryRead();
      memory.appPathCache = appPathCache;
      const { default: bus } = await import('../utils/event-bus.js');
      bus.emit('memory:write-requested', memory);
    } catch (e) { _log('warn', `save scan cache: ${e.message}`); }
    return count;
  } catch (e) {
    _log('warn', `scanAllInstalledApps: ${e.message}`);
  }
  return 0;
}

export async function loadAppPathCache() {
  try {
    const memory = await window.electronAPI.memoryRead();
    if (memory.appPathCache) {
      appPathCache = memory.appPathCache;
      _log('info', `App path cache loaded: ${Object.keys(appPathCache).length} entries`);
      _pruneStaleCacheEntries().catch(e => _log('warn', `prune cache: ${e.message}`));
    }
    if (memory.userDefinedApps) {
      userDefinedApps = memory.userDefinedApps;
      _log('info', `User-defined apps loaded: ${Object.keys(userDefinedApps).length} entries`);
    }
    setTimeout(() => {
      preloadAppCache().catch(e => _log('warn', `preload: ${e.message}`));
    }, 2000);
    setTimeout(() => {
      scanAllInstalledApps().catch(e => _log('warn', `background scan: ${e.message}`));
    }, 12000);
  } catch (e) {
    _log('warn', `Could not load app path cache: ${e.message}`);
  }
}

// Elimina del cache las rutas de apps desinstaladas (archivo ya no existe)
async function _pruneStaleCacheEntries() {
  const candidates = Object.entries(appPathCache).filter(([k, v]) =>
    v && !v.startsWith('shell:') && (v.includes('\\') || v.includes('/'))
  );
  if (candidates.length === 0) return;
  const BATCH = 25;
  const missing = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(([k, v]) =>
      window.electronAPI.fileInfo(v)
        .then(r => ({ k, ok: !!(r && r.success) }))
        .catch(() => ({ k, ok: false }))
    ));
    for (const r of results) if (!r.ok) missing.push(r.k);
  }
  if (missing.length === 0) return;
  for (const k of missing) delete appPathCache[k];
  _log('info', `Purged ${missing.length} uninstalled apps from path cache (${Object.keys(appPathCache).length} left)`);
  await saveAppPathCache();
}

async function saveAppPathCache() {
  try {
    const memory = await window.electronAPI.memoryRead();
    memory.appPathCache = appPathCache;
    const { default: bus } = await import('../utils/event-bus.js');
    bus.emit('memory:write-requested', memory);
  } catch (e) {
    _log('warn', `Could not save app path cache: ${e.message}`);
  }
}

async function _saveUserDefinedApps() {
  try {
    const memory = await window.electronAPI.memoryRead();
    memory.userDefinedApps = userDefinedApps;
    const { default: bus } = await import('../utils/event-bus.js');
    bus.emit('memory:write-requested', memory);
  } catch (e) {
    _log('warn', `Could not save user-defined apps: ${e.message}`);
  }
}

const PRECACHE_KNOWN_EXES = (() => {
  const seen = new Set();
  const exes = [];
  for (const app of Object.values(KNOWN_APPS)) {
    if (app.exe && !seen.has(app.exe.toLowerCase())) {
      seen.add(app.exe.toLowerCase());
      exes.push(app.exe);
    }
  }
  return exes;
})();

export async function preloadAppCache() {
  if (Object.keys(appPathCache).length > 50) {
    _log('info', `Cache ya tiene ${Object.keys(appPathCache).length} entries, saltando precarga`);
    return;
  }
  _log('info', `Pre-cargando rutas de ${PRECACHE_KNOWN_EXES.length} apps conocidas...`);
  const exesJson = PRECACHE_KNOWN_EXES.map(e => `'${e.replace(/'/g, "''")}'`).join(', ');
  const psCmd = `
    $ErrorActionPreference = 'SilentlyContinue';
    $results = @{};
    $exes = @(${exesJson});
    foreach ($e in $exes) {
      $path = (Get-Command $e -ErrorAction SilentlyContinue).Source;
      if ($path -and (Test-Path $path)) {
        $key = $e.ToLower().Replace('.exe','').Trim();
        $results[$key] = $path;
      }
    }
    if ($results.Count -eq 0) { Write-Output '{}' } else { ConvertTo-Json $results -Compress }
  `;
  try {
    const result = await window.electronAPI.runPowerShell(psCmd);
    if (result.success && result.output && result.output !== '{}') {
      let parsed;
      try { parsed = JSON.parse(result.output); } catch (e) { return; }
      let count = 0;
      Object.keys(parsed).forEach(k => {
        const v = (parsed[k] || '').trim();
        if (v && !appPathCache[k]) {
          appPathCache[k] = v;
          count++;
        }
      });
      _log('info', `Precarga: ${count} rutas resueltas (cache total: ${Object.keys(appPathCache).length})`);
      try {
        const memory = await window.electronAPI.memoryRead();
        memory.appPathCache = appPathCache;
        const { default: bus } = await import('../utils/event-bus.js');
        bus.emit('memory:write-requested', memory);
      } catch (e) { _log('warn', `save precache: ${e.message}`); }
    }
  } catch (e) {
    _log('warn', `preloadAppCache error: ${e.message}`);
  }
}

function _normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function _fuzzyScore(query, target) {
  const q = _normalize(query);
  const t = _normalize(target);
  if (t === q) return 100;
  if (t.includes(q) || q.includes(t)) return 80;
  if (t.startsWith(q) || q.startsWith(t)) return 60;
  const dist = _levenshtein(q, t);
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 0;
  const similarity = (1 - dist / maxLen) * 100;
  if (similarity >= 70) return similarity;
  const qWords = q.split(' ');
  const tWords = t.split(' ');
  const common = qWords.filter(w => tWords.some(tw => tw.includes(w) || w.includes(tw)));
  if (common.length > 0) return 30 + (common.length / Math.max(qWords.length, tWords.length)) * 30;
  return 0;
}

function _findBestAppMatch(name) {
  const norm = _normalize(name);
  let bestScore = 0;
  let bestKey = null;

  for (const [key, app] of Object.entries(KNOWN_APPS)) {
    let score = _fuzzyScore(norm, key);
    for (const alias of (app.names || [])) {
      const aliasScore = _fuzzyScore(norm, alias);
      if (aliasScore > score) score = aliasScore;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  if (bestKey && bestScore >= 40) return { key: bestKey, score: bestScore };
  return { key: null, score: 0 };
}

function _matchEntry(rawName) {
  const name = _normalize(rawName);

  let entryKey = Object.keys(KNOWN_APPS).find(k => _normalize(k) === name);
  if (entryKey) return entryKey;

  entryKey = Object.keys(KNOWN_APPS).find(k =>
    KNOWN_APPS[k].names.some(n => _normalize(n) === name)
  );
  if (entryKey) return entryKey;

  entryKey = Object.keys(KNOWN_APPS).find(k =>
    KNOWN_APPS[k].names.some(n => {
      const nn = _normalize(n);
      return name.includes(nn) || nn.includes(name);
    })
  );
  if (entryKey) return entryKey;

  entryKey = Object.keys(KNOWN_APPS).find(k => {
    const nk = _normalize(k);
    return name.includes(nk) || nk.includes(name);
  });
  if (entryKey) return entryKey;

  const fuzzy = _findBestAppMatch(name);
  if (fuzzy.key) return fuzzy.key;

  return null;
}

function _fuzzyCacheLookup(name) {
  const norm = _normalize(name);
  if (appPathCache[norm]) return appPathCache[norm];
  const keys = Object.keys(appPathCache);
  for (const k of keys) {
    const kN = _normalize(k);
    if (kN === norm || kN.includes(norm) || norm.includes(kN)) return appPathCache[k];
  }
  return null;
}

function _getCategoryApp(categoryKey) {
  const apps = _appsByCategory(categoryKey);
  if (apps.length === 0) return null;
  const sorted = apps.sort((a, b) => {
    const getPriority = (exe) => exe ? 1 : 2;
    return getPriority(a.exe) - getPriority(b.exe);
  });
  return sorted[0].key;
}

export async function launchApp(appName) {
  await _seedCatalog();
  const rawName = (appName || '').trim();

  if (/^[A-Za-z]:[\\/]/.test(rawName) || rawName.startsWith('%') || rawName.startsWith('\\\\')) {
    const pathResult = await _openByPath(rawName);
    return pathResult;
  }

  try {
    const result = await newLaunchApp(rawName);
    if (result.ok) {
      _log('info', `New launcher OK: "${rawName}" → ${result.app}`);
      return _formatNewResult(rawName, result);
    }
    if (result.errorCode === 'APP_NOT_FOUND') {
      _log('info', `New launcher not found "${rawName}", checking legacy...`);
    } else {
      _log('warn', `New launcher error: ${result.error}`);
    }
  } catch (e) {
    _log('warn', `New launcher error: ${e.message}, usando legacy`);
  }

  return _legacyLaunch(rawName);
}

async function _openByPath(rawName) {
  let path = rawName;
  if (path.includes('%')) {
    try {
      const r = await window.electronAPI.runPowerShell(
        `[Environment]::ExpandEnvironmentVariables('${path.replace(/'/g, "''")}')`
      );
      if (r.success && r.output) path = r.output.trim();
    } catch {}
  }
  try {
    const r = await window.electronAPI.openPath(path);
    return { success: r.success, output: r.success ? `${path} abierto.` : `No se pudo abrir ${path}: ${r.output || 'error desconocido'}` };
  } catch (e) {
    return { success: false, output: `No se pudo abrir ${path}: ${e.message}` };
  }
}

function _formatNewResult(rawName, result) {
  const parts = [];
  if (result.resolvedBy) parts.push(`resolución: ${result.resolvedBy}`);
  if (result.method) parts.push(`método: ${result.method}`);
  if (result.verificationStatus === 'confirmed') parts.push('verificado');
  const suffix = parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  return { success: true, output: `${rawName} abierto.${suffix}` };
}

async function _legacyLaunch(rawName) {
  const name = _normalize(rawName);

  const categoryKey = _getCategoryFromAlias(name);
  if (categoryKey) {
    const categoryApp = _getCategoryApp(categoryKey);
    if (categoryApp) {
      _log('info', `Category match: "${name}" → category "${categoryKey}" → app "${categoryApp}"`);
      return await _launchAppInternal(categoryApp, APP_CATEGORIES[categoryKey]);
    }
  }

  const entryKey = _matchEntry(name);
  const entry = entryKey ? KNOWN_APPS[entryKey] : null;

  _log('info', `Legacy launch: "${rawName}" → key="${entryKey || 'none'}"`);

  if (!entryKey && userDefinedApps[name]) {
    _log('info', `User-defined app: "${rawName}" → "${userDefinedApps[name]}"`);
    const path = userDefinedApps[name];
    const r = await window.electronAPI.openPath(path);
    if (r && (r.success === undefined || r.success === true)) {
      return { success: true, output: `${rawName} abierto.` };
    }
    return { success: false, output: `No se pudo abrir "${rawName}". La ruta guardada ya no existe.` };
  }

  if (entry && !entry.exe && entry.url) {
    const localPath = appPathCache[entryKey] || appPathCache[name];
    if (localPath) {
      _log('info', `Cache tiene ruta local para "${entryKey}", ignorando web redirect`);
      return await _launchWindows(rawName, name, entryKey, entry);
    }
    if (_isMsUri(entry.url)) {
      const r = await window.electronAPI.openBrowser(entry.url);
      return { success: r.success, output: r.success ? `${rawName} abierto.` : `Error: ${r.output}` };
    }
    _log('info', `Web redirect: ${entry.url}`);
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${rawName} abierto en el navegador.` : `Error: ${r.output}` };
  }

  const platform = (typeof process !== 'undefined' && process.platform) || 'win32';
  if (platform !== 'win32') {
    return await _launchUnix(rawName, name, entryKey, entry, platform);
  }

  return await _launchWindows(rawName, name, entryKey, entry);
}

async function _launchAppInternal(appKey, displayName) {
  const entry = KNOWN_APPS[appKey];
  if (!entry) return { success: false, output: `No se encontró la aplicación.` };
  const name = displayName || appKey;

  if (!entry.exe && entry.url) {
    const localPath = appPathCache[appKey] || appPathCache[name];
    if (localPath) {
      _log('info', `Cache tiene ruta local para "${appKey}", ignorando web redirect`);
      return await _launchWindows(name, name, appKey, entry);
    }
    if (_isMsUri(entry.url)) {
      const r = await window.electronAPI.openBrowser(entry.url);
      return { success: r.success, output: r.success ? `${name} abierto.` : `Error: ${r.output}` };
    }
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${name} abierto en el navegador.` : `Error: ${r.output}` };
  }

  return await _launchWindows(name, name, appKey, entry);
}

async function _launchUnix(rawName, name, entryKey, entry, platform) {
  _log('info', `Lanzador UNIX para "${name}" en ${platform}`);
  const mapping = PLATFORM_APPS[platform] || {};
  const candidates = mapping[entryKey] || [name];

  if (platform === 'darwin') {
    for (const app of candidates) {
      const r = await window.electronAPI.runCmd(`open -a "${app}" 2>/dev/null`);
      if (r.success) return { success: true, output: `${rawName} abierto.` };
    }
    const r = await window.electronAPI.runCmd(`open -a "${rawName}" 2>/dev/null`);
    if (r.success) return { success: true, output: `${rawName} abierto.` };
  } else {
    for (const app of candidates) {
      const r = await window.electronAPI.runCmd(`${app} & disown 2>/dev/null`);
      if (r.success) return { success: true, output: `${rawName} abierto.` };
    }
  }

  if (entry && entry.url) {
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${rawName} abierto en el navegador.` : `Error: ${r.output}` };
  }
  return { success: false, output: `No se pudo abrir "${rawName}" en tu sistema.` };
}

async function _launchWindows(rawName, name, entryKey, entry) {
  const targets = [];
  if (entryKey === 'chrome') {
    targets.push('chrome.exe', 'msedge.exe', 'brave.exe', 'firefox.exe');
  } else if (entryKey === 'terminal') {
    targets.push('WindowsTerminal.exe', 'wt.exe', 'pwsh.exe', 'powershell.exe', 'cmd.exe');
  } else if (entryKey === 'firefox') {
    targets.push('firefox.exe');
  } else if (entryKey === 'edge') {
    targets.push('msedge.exe');
  } else {
    if (entry && entry.exe) targets.push(entry.exe);
    const nameVariants = [rawName, name].flatMap(n => [`${n}.exe`, n]);
    for (const v of nameVariants) {
      if (!targets.includes(v)) targets.push(v);
    }
  }

  const cacheKey = entryKey || name;
  const cachedPath = appPathCache[cacheKey] || _fuzzyCacheLookup(name);

  if (cachedPath) {
    _log('info', `Cache hit: "${name}"`);
    if (cachedPath.startsWith('shell:AppsFolder\\')) {
      const appId = cachedPath.replace('shell:AppsFolder\\', '');
      const r = await window.electronAPI.launchUwp(appId);
      if (r && r.success) return { success: true, output: `${rawName} abierto.` };
      _log('warn', `Cache stale ${cacheKey}`);
      delete appPathCache[cacheKey];
    } else {
      const r = await window.electronAPI.openPath(cachedPath);
      if (r && (r.success === undefined || r.success === true)) {
        return { success: true, output: `${rawName} abierto.` };
      }
      _log('warn', `Cache stale ${cacheKey}`);
      delete appPathCache[cacheKey];
    }
  }

  // Fast path: known entry with exe — try direct spawn before costly find-app.
  // Solo con ruta real (con separadores o shell:): nombres pelados no existen en disco
  // y abrirlos directo genera cuadros de error de Windows.
  if (entry && entry.exe && entryKey && (entry.exe.includes('\\') || entry.exe.includes('/') || entry.exe.startsWith('shell:'))) {
    _log('info', `Fast launch known app: "${entry.exe}"`);
    const r = await window.electronAPI.launchExec(entry.exe);
    if (r && r.success) {
      appPathCache[cacheKey] = entry.exe;
      saveAppPathCache();
      return { success: true, output: `${rawName} abierto.` };
    }
    const r2 = await window.electronAPI.openPath(entry.exe);
    if (r2 && (r2.success === undefined || r2.success === true)) {
      appPathCache[cacheKey] = entry.exe;
      saveAppPathCache();
      return { success: true, output: `${rawName} abierto.` };
    }
  }

  _log('info', `Búsqueda rápida: "${name}"`);

  const findResult = await window.electronAPI.findApp({
    exeTargets: targets.slice(0, 8),
    appName: name,
    name,
    cacheKey,
  });

  if (findResult && findResult.found) {
    const found = findResult.found;
    appPathCache[cacheKey] = found;
    saveAppPathCache();
    if (found.startsWith('shell:AppsFolder\\')) {
      const appId = found.replace('shell:AppsFolder\\', '');
      const r = await window.electronAPI.launchUwp(appId);
      if (r && r.success) return { success: true, output: `${rawName} abierto.` };
    } else {
      const r = await window.electronAPI.openPath(found);
      if (r && (r.success === undefined || r.success === true)) {
        return { success: true, output: `${rawName} abierto.` };
      }
    }
  }

  _log('info', `find-app no encontró "${name}"`);

  if (entry && entry.url) {
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${rawName} abierto en el navegador.` : `Error: ${r.output}` };
  }

  // Fallback: entry.exe / rawName via start-process (spawn directo, sin cmd /c start)
  const startFallbackTarget = (entry && entry.exe) ? entry.exe : rawName;
  _log('info', `Start-Process fallback: "${startFallbackTarget}"`);
  try {
    const r = await window.electronAPI.startProcess(startFallbackTarget);
    if (r && r.success) {
      appPathCache[cacheKey] = startFallbackTarget;
      saveAppPathCache();
      return { success: true, output: `${rawName} abierto.` };
    }
  } catch {}

  // Last resort: aggressive PowerShell search using BOTH rawName and entry.exe
  _log('info', `Fallback: búsqueda exhaustiva de "${rawName}"`);
  try {
    const { executePowerShellCommand } = await import('./powershell.js');
    const escapedName = rawName.replace(/'/g, "''");
    const escapedEntryExe = (entry && entry.exe) ? entry.exe.replace(/'/g, "''") : '';
    const psCmd = `
      $names = @('${escapedName}')
      ${escapedEntryExe ? `$names += '${escapedEntryExe}'` : ''}
      $foundPath = $null

      # 1: Get-Command with wildcard (PATH + current dir)
      foreach ($n in $names) {
        $cmd = Get-Command -Name $n, \"$n.exe\", \"$n*\" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd) { $foundPath = $cmd.Source; break }
      }

      # 2: Check Windows dir directly
      if (-not $foundPath) {
        foreach ($n in $names) {
          $winCheck = \"$env:windir\\$n.exe\"
          if (Test-Path $winCheck) { $foundPath = $winCheck; break }
          $winCheck = \"$env:windir\\System32\\$n.exe\"
          if (Test-Path $winCheck) { $foundPath = $winCheck; break }
        }
      }

      # 3: Search StartApps (Microsoft Store + pinned apps)
      if (-not $foundPath) {
        $apps = Get-StartApps | Where-Object { \$_.Name -like \"*$escapedName*\" } | Select-Object -First 1
        if ($apps) { $foundPath = \"shell:AppsFolder\\$($apps.AppID)\" }
      }

      if ($foundPath) {
        if ($foundPath -like \"shell:AppsFolder\\*\") {
          Start-Process \"shell:AppsFolder\\$($foundPath -replace 'shell:AppsFolder\\\\', '')\"
        } else {
          Start-Process $foundPath
        }
        Write-Output $foundPath
      } else {
        Write-Output \"NOT_FOUND\"
      }
    `;
    const psResult = await Promise.race([
      executePowerShellCommand(psCmd, `Iniciar ${rawName}`, false),
      new Promise(resolve => setTimeout(() => resolve({ success: false, output: '', _timeout: true }), 10000))
    ]);
    if (psResult.success && psResult.output && psResult.output.trim() !== 'NOT_FOUND') {
      const actualPath = psResult.output.trim();
      appPathCache[cacheKey] = actualPath;
      saveAppPathCache();
      return { success: true, output: `${rawName} abierto.` };
    }
  } catch {}

  return {
    success: false,
    output: `No encontré "${rawName}" instalada en el sistema. Puede que se haya desinstalado. Si conocés la ruta del ejecutable, decime "recordá app" y la guardo.`
  };
}

export async function rememberApp(name, path) {
  const cleanName = _normalize(name.trim());
  const cleanPath = path.trim();

  if (!cleanName || !cleanPath) {
    return { success: false, output: 'Necesito el nombre y la ruta de la aplicación.' };
  }

  if (!cleanPath.includes('\\') && !cleanPath.includes('/') && !cleanPath.endsWith('.exe')) {
    return { success: false, output: 'La ruta no parece válida. Debe ser una ruta completa como "C:\\Program Files\\...\\app.exe".' };
  }

  userDefinedApps[cleanName] = cleanPath;
  appPathCache[cleanName] = cleanPath;
  await _saveUserDefinedApps();
  await saveAppPathCache();

  _log('info', `User-defined app saved: "${cleanName}" → "${cleanPath}"`);
  return { success: true, output: `Recordado: "${name}" → ${cleanPath}. La próxima vez que me pidas abrir "${name}", lo abriré al instante.` };
}

export async function listUserApps() {
  const entries = Object.entries(userDefinedApps);
  if (entries.length === 0) {
    return { success: true, output: 'No tienes aplicaciones personalizadas guardadas.' };
  }
  const list = entries.map(([name, path]) => `• ${name}: ${path}`).join('\n');
  return { success: true, output: `Tus aplicaciones guardadas (${entries.length}):\n${list}` };
}

export async function forgetApp(name) {
  const cleanName = _normalize(name.trim());
  if (userDefinedApps[cleanName]) {
    delete userDefinedApps[cleanName];
    delete appPathCache[cleanName];
    await _saveUserDefinedApps();
    await saveAppPathCache();
    return { success: true, output: `Olvidado: "${name}". Ya no recordaré esa aplicación.` };
  }
  if (KNOWN_APPS[cleanName]) {
    return { success: false, output: `"${name}" es una aplicación conocida por Jarvis. No es necesario olvidarla.` };
  }
  return { success: false, output: `No encontré ninguna aplicación guardada como "${name}".` };
}

export async function listInstalledApps(filterText) {
  const catalog = AppCatalog.getInstance();
  await catalog.load();
  if (catalog.count() < 50) {
    await launchRebuildCatalog();
  }
  let entries = catalog.getAll();

  if (entries.length === 0) {
    return { success: false, output: 'No se encontraron aplicaciones en el catálogo.' };
  }

  // Solo apps realmente instaladas: se excluyen links web (uri/url) y
  // fallbacks con nombre pelado sin ruta verificable (ej. "MinecraftLauncher.exe")
  entries = entries.filter(e => {
    if (e.type === 'uri' || e.type === 'url') return false;
    if (e.path && !e.path.startsWith('shell:') && !e.path.includes('\\') && !e.path.includes('/')) return false;
    return true;
  });

  if (filterText) {
    const q = filterText.toLowerCase().trim();
    entries = entries.filter(e => e.name.toLowerCase().includes(q));
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const appList = entries.slice(0, 50).map(e => e.name).join('\n');
  const more = entries.length > 50 ? `\n... y ${entries.length - 50} más` : '';
  const filteredNote = filterText ? ` (coinciden con "${filterText}")` : '';
  const output = `Aplicaciones${filteredNote} (${entries.length}):\n${appList}${more}`;
  return { success: true, output, apps: entries };
}

export async function newLaunchAppDirect(appName) {
  await _seedCatalog();
  return await newLaunchApp(appName);
}

export async function rebuildCatalog() {
  return await launchRebuildCatalog();
}

export async function listAppsByCategory(categoryName) {
  const categoryKey = _getCategoryFromAlias(categoryName) || categoryName;
  const apps = _appsByCategory(categoryKey);
  if (apps.length === 0) {
    const cats = Object.keys(APP_CATEGORIES);
    const list = cats.map(c => `• ${APP_CATEGORIES[c]} (${_appsByCategory(c).length} apps)`).join('\n');
    return { success: true, output: `Categorías disponibles:\n${list}\n\nEj: "abrí un navegador", "abrí un juego", "abrí el editor de código"` };
  }
  const label = APP_CATEGORIES[categoryKey] || categoryKey;
  const appList = apps.map(a => `• ${a.key}: ${a.names.slice(0, 3).join(', ')}`).join('\n');
  return { success: true, output: `Apps de "${label}" (${apps.length}):\n${appList}` };
}
