import { executePowerShellCommand, executeWithFallback } from './powershell.js';
import { createLogger } from '../utils/logger.js';
const _log = createLogger('APPS');

let appPathCache = {};

// ─── KNOWN APPS DATABASE ────────────────────────────────────────────────────
// Extended with more Spanish aliases and common misspellings
const KNOWN_APPS = {
  chrome:        { exe: 'chrome.exe',          url: 'https://google.com',         names: ['chrome', 'google chrome', 'navegador', 'explorador web', 'browser', 'internet', 'web', 'buscador', 'google', 'chromium'] },
  firefox:       { exe: 'firefox.exe',         url: 'https://google.com',         names: ['firefox', 'mozilla firefox', 'mozilla', 'zorro de fuego'] },
  edge:          { exe: 'msedge.exe',          url: 'https://google.com',         names: ['edge', 'microsoft edge', 'ms edge'] },
  brave:         { exe: 'brave.exe',           url: 'https://google.com',         names: ['brave', 'brave browser'] },
  spotify:       { exe: 'Spotify.exe',         url: 'https://open.spotify.com',   names: ['spotify', 'musica', 'música', 'spoti', 'spotify music'] },
  code:          { exe: 'Code.exe',            url: null,                          names: ['code', 'vs code', 'visual studio code', 'vscode', 'codigo', 'código', 'vs', 'editor de codigo', 'editor de código'] },
  discord:       { exe: 'Discord.exe',         url: 'https://discord.com/app',    names: ['discord', 'disc', 'discor', 'discord app'] },
  steam:         { exe: 'steam.exe',           url: null,                          names: ['steam', 'juegos', 'steam games'] },
  whatsapp:      { exe: 'WhatsApp.exe',        url: 'https://web.whatsapp.com',   names: ['whatsapp', 'whats app', 'wsp', 'wasap', 'whats', 'wa'] },
  telegram:      { exe: 'Telegram.exe',        url: 'https://web.telegram.org',   names: ['telegram', 'telégram', 'tg'] },
  obsidian:      { exe: 'Obsidian.exe',        url: null,                          names: ['obsidian', 'notas obsidian'] },
  slack:         { exe: 'slack.exe',           url: 'https://slack.com',          names: ['slack'] },
  zoom:          { exe: 'Zoom.exe',            url: 'https://zoom.us',            names: ['zoom', 'zoom meetings', 'videollamada', 'reunion zoom'] },
  calculator:    { exe: 'calc.exe',            url: null,                          names: ['calculadora', 'calculator', 'calc', 'calcular', 'calcula'] },
  notepad:       { exe: 'notepad.exe',         url: null,                          names: ['notepad', 'bloc de notas', 'block de notas', 'notas', 'nota', 'editor de texto'] },
  paint:         { exe: 'mspaint.exe',         url: null,                          names: ['paint', 'mspaint', 'dibujo', 'pintura', 'ms paint'] },
  terminal:      { exe: 'WindowsTerminal.exe', url: null,                          names: ['terminal', 'windows terminal', 'consola', 'wt', 'cmd terminal'] },
  cmd:           { exe: 'cmd.exe',             url: null,                          names: ['cmd', 'simbolo del sistema', 'command prompt', 'simbolo sistema', 'símbolo del sistema'] },
  powershell:    { exe: 'powershell.exe',      url: null,                          names: ['powershell', 'power shell', 'pwsh', 'shell'] },
  explorer:      { exe: 'explorer.exe',        url: null,                          names: ['explorer', 'file explorer', 'windows explorer', 'archivos', 'explorador', 'explorador de archivos', 'mis archivos', 'mis documentos'] },
  settings:      { exe: null,                  url: 'ms-settings:',               names: ['settings', 'configuracion', 'ajustes', 'configuración', 'opciones', 'preferencias', 'windows settings'] },
  taskmanager:   { exe: 'taskmgr.exe',         url: null,                          names: ['task manager', 'administrador de tareas', 'taskmanager', 'admin tareas', 'procesos', 'monitor'] },
  control:       { exe: 'control',             url: null,                          names: ['control panel', 'panel de control', 'control'] },
  word:          { exe: 'WINWORD.EXE',         url: null,                          names: ['word', 'microsoft word', 'microsoftword', 'documento word'] },
  excel:         { exe: 'EXCEL.EXE',           url: null,                          names: ['excel', 'microsoft excel', 'microsoftexcel', 'hoja de calculo', 'hoja de cálculo', 'planilla'] },
  powerpoint:    { exe: 'POWERPNT.EXE',        url: null,                          names: ['powerpoint', 'microsoft powerpoint', 'ppt', 'presentaciones', 'presentacion', 'presentación', 'slides'] },
  youtube:       { exe: null,                  url: 'https://youtube.com',         names: ['youtube', 'yt', 'you tube', 'videos', 'tube'] },
  gmail:         { exe: null,                  url: 'https://gmail.com',           names: ['gmail', 'correo gmail', 'mail', 'correo', 'email', 'correo electronico', 'correo electrónico'] },
  maps:          { exe: null,                  url: 'https://maps.google.com',     names: ['maps', 'google maps', 'mapas', 'mapa', 'google map'] },
  drive:         { exe: null,                  url: 'https://drive.google.com',    names: ['drive', 'google drive', 'google docs'] },
  netflix:       { exe: null,                  url: 'https://netflix.com',         names: ['netflix', 'peliculas', 'películas', 'series netflix'] },
  instagram:     { exe: null,                  url: 'https://instagram.com',       names: ['instagram', 'ig', 'insta', 'fotos'] },
  twitter:       { exe: null,                  url: 'https://twitter.com',         names: ['twitter', 'x', 'x.com', 'twt'] },
  facebook:      { exe: null,                  url: 'https://facebook.com',        names: ['facebook', 'fb', 'face'] },
  chatgpt:       { exe: null,                  url: 'https://chat.openai.com',     names: ['chatgpt', 'openai', 'gpt', 'chat gpt', 'chat openai'] },
  obs:           { exe: 'obs64.exe',           url: null,                          names: ['obs', 'obs studio', 'open broadcaster', 'streaming', 'stream', 'grabar pantalla', 'grabacion', 'grabación'] },
  vlc:           { exe: 'vlc.exe',             url: null,                          names: ['vlc', 'vlc media player', 'reproductor', 'reproductor de video', 'media player'] },
  photoshop:     { exe: 'Photoshop.exe',       url: null,                          names: ['photoshop', 'ps', 'adobe photoshop', 'fotos editor', 'editor de fotos'] },
  illustrator:   { exe: 'Illustrator.exe',     url: null,                          names: ['illustrator', 'ai', 'adobe illustrator', 'ilustrador'] },
  figma:         { exe: 'Figma.exe',           url: 'https://figma.com',           names: ['figma', 'figma desktop', 'diseño', 'diseno'] },
  unity:         { exe: 'Unity.exe',           url: null,                          names: ['unity', 'unity hub', 'unity editor', 'motor de juego'] },
  teams:         { exe: 'ms-teams.exe',        url: 'https://teams.microsoft.com', names: ['teams', 'microsoft teams', 'ms teams', 'reuniones', 'reunion'] },
  outlook:       { exe: 'OUTLOOK.EXE',         url: 'https://outlook.live.com',    names: ['outlook', 'correo outlook', 'microsoft outlook'] },
  onenote:       { exe: 'ONENOTE.EXE',         url: null,                          names: ['onenote', 'one note', 'notas microsoft'] },
  notepadpp:     { exe: 'notepad++.exe',       url: null,                          names: ['notepad++', 'notepad plus', 'notepadpp', 'npp'] },
  winrar:        { exe: 'WinRAR.exe',          url: null,                          names: ['winrar', 'win rar', 'rar', 'compresor'] },
  _7zip:         { exe: '7zFM.exe',            url: null,                          names: ['7zip', '7-zip', '7z', 'siete zip'] },
  cursor:        { exe: 'cursor.exe',          url: null,                          names: ['cursor', 'cursor editor', 'cursor ai', 'cursor ide'] },
  windsurf:      { exe: 'windsurf.exe',        url: null,                          names: ['windsurf', 'windsurf ide', 'windsurf editor'] },
  git:           { exe: null,                  url: null,                          names: ['git bash', 'git gui', 'gitbash'] },
  postman:       { exe: 'Postman.exe',         url: null,                          names: ['postman', 'api test', 'postman app'] },
  docker:        { exe: 'Docker Desktop.exe',  url: null,                          names: ['docker', 'docker desktop', 'contenedores'] },
  telegram_web:  { exe: null,                  url: 'https://web.telegram.org',    names: ['telegram web'] },
  tiktok:        { exe: null,                  url: 'https://tiktok.com',          names: ['tiktok', 'tik tok'] },
  linkedin:      { exe: null,                  url: 'https://linkedin.com',        names: ['linkedin', 'linked in'] },
  github:        { exe: null,                  url: 'https://github.com',          names: ['github', 'git hub', 'gh'] },
  clock:         { exe: null,                  url: 'ms-clock:',                   names: ['reloj', 'clock', 'alarma', 'cronometro', 'cronómetro', 'timer windows', 'temporizador windows'] },
  snipping:      { exe: 'SnippingTool.exe',    url: null,                          names: ['snipping tool', 'recortes', 'captura de pantalla', 'recortador', 'screenshot tool'] },
  store:         { exe: null,                  url: 'ms-windows-store:',           names: ['store', 'tienda windows', 'microsoft store', 'windows store', 'tienda'] },
  camera:        { exe: null,                  url: 'microsoft.windows.camera:',   names: ['camera', 'camara', 'cámara', 'webcam'] },
  photos:        { exe: null,                  url: 'ms-photos:',                  names: ['photos', 'fotos', 'galeria', 'galería', 'visor de fotos'] },
  maps_uwp:      { exe: null,                  url: 'bingmaps:',                   names: ['bing maps', 'mapas windows'] },
  // Antivirus / Security
  malwarebytes:  { exe: 'mbam.exe',            url: null,                          names: ['malwarebytes', 'antivirus', 'anti virus'] },
  // Productivity
  notion:        { exe: 'Notion.exe',          url: 'https://notion.so',           names: ['notion', 'notion app'] },
  trello:        { exe: null,                  url: 'https://trello.com',          names: ['trello'] },
  // Media
  plex:          { exe: 'Plex.exe',            url: null,                          names: ['plex', 'plex media', 'media server'] },
  kodi:          { exe: 'kodi.exe',            url: null,                          names: ['kodi', 'kodi media'] },
  // Gaming
  epicgames:     { exe: 'EpicGamesLauncher.exe', url: null,                        names: ['epic games', 'epic', 'epic launcher', 'fortnite launcher'] },
  origin:        { exe: 'Origin.exe',          url: null,                          names: ['origin', 'ea origin', 'ea games'] },
  battlenet:     { exe: 'Battle.net.exe',      url: null,                          names: ['battle.net', 'blizzard', 'battlenet', 'wow', 'overwatch'] },
};

// ─── PLATFORM SUPPORT ──────────────────────────────────────────────────────
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

// ─── APP CACHE ──────────────────────────────────────────────────────────────
export async function scanAllInstalledApps() {
  _log('info', 'Escaneando todas las apps instaladas...');
  const psCmd = `
    $ErrorActionPreference = 'SilentlyContinue';
    $results = @{};
    $dirs = @(
      "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
      "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
      [Environment]::GetFolderPath("Desktop")
    );
    foreach ($d in $dirs) {
      $lnks = Get-ChildItem -Path $d -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue;
      foreach ($lnk in $lnks) {
        $base = $lnk.BaseName.ToLower().Trim();
        $shell = New-Object -ComObject WScript.Shell;
        try {
          $sc = $shell.CreateShortcut($lnk.FullName);
          $target = $sc.TargetPath;
          if ($target -and (Test-Path $target)) {
            $results[$base] = $target;
          }
        } catch {}
      }
    }
    $regPaths = @("HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths","HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths");
    foreach ($rp in $regPaths) {
      if (Test-Path $rp) {
        $items = Get-ChildItem -Path $rp -ErrorAction SilentlyContinue;
        foreach ($item in $items) {
          $val = (Get-ItemProperty $item.PSPath -ErrorAction SilentlyContinue).'(default)';
          if ($val -and (Test-Path $val)) {
            $results[$item.PSChildName.ToLower().Replace('.exe','')] = $val;
          }
        }
      }
    }
    # Also check WindowsApps
    $waPath = "$env:LOCALAPPDATA\\Microsoft\\WindowsApps";
    if (Test-Path $waPath) {
      Get-ChildItem -Path $waPath -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        $results[$_.BaseName.ToLower()] = $_.FullName;
      }
    }
    $results | ConvertTo-Json -Compress
  `;
  try {
    const result = await window.electronAPI.runPowerShell(psCmd);
    if (result.success && result.output) {
      let parsed;
      try { parsed = JSON.parse(result.output); } catch (e) { return 0; }
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
        const memory = await window.electronAPI.memoryRead();
        memory.appPathCache = appPathCache;
        const { default: bus } = await import('../utils/event-bus.js');
        bus.emit('memory:write-requested', memory);
      } catch (e) { _log('warn', `save scan cache: ${e.message}`); }
      return count;
    }
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
    }
    // Run full scan in background to update cache
    setTimeout(() => {
      scanAllInstalledApps().catch(e => _log('warn', `background scan: ${e.message}`));
    }, 3000);
  } catch (e) {
    _log('warn', `Could not load app path cache: ${e.message}`);
  }
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

// ─── MATCHING ENGINE ────────────────────────────────────────────────────────
function _normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _matchEntry(rawName) {
  const name = _normalize(rawName);
  
  // 1. Exact key match
  let entryKey = Object.keys(KNOWN_APPS).find(k => _normalize(k) === name);
  if (entryKey) return entryKey;

  // 2. Exact alias match
  entryKey = Object.keys(KNOWN_APPS).find(k =>
    KNOWN_APPS[k].names.some(n => _normalize(n) === name)
  );
  if (entryKey) return entryKey;

  // 3. Partial match (name contains alias or alias contains name)
  entryKey = Object.keys(KNOWN_APPS).find(k =>
    KNOWN_APPS[k].names.some(n => {
      const nn = _normalize(n);
      return name.includes(nn) || nn.includes(name);
    })
  );
  if (entryKey) return entryKey;

  // 4. Key partial match
  entryKey = Object.keys(KNOWN_APPS).find(k => {
    const nk = _normalize(k);
    return name.includes(nk) || nk.includes(name);
  });
  if (entryKey) return entryKey;

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

// ─── LAUNCH ENGINE ──────────────────────────────────────────────────────────
export async function launchApp(appName) {
  const rawName = (appName || '').trim();
  const name = _normalize(rawName);
  const entryKey = _matchEntry(name);
  const entry = entryKey ? KNOWN_APPS[entryKey] : null;

  _log('info', `launchApp: "${rawName}" → key="${entryKey || 'none'}"`);

  // ── 1. URL / Web app (no exe) ──
  if (entry && !entry.exe && entry.url) {
    _log('info', `Web redirect: ${entry.url}`);
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${rawName} abierto en el navegador.` : `Error: ${r.output}` };
  }

  // ── 2. MS URI schemes (ms-settings:, ms-clock:, etc.) ──
  if (entry && entry.url && entry.url.startsWith('ms-')) {
    _log('info', `MS URI: ${entry.url}`);
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${rawName} abierto.` : `Error: ${r.output}` };
  }

  // ── 3. Non-Windows (macOS & Linux) ──
  const platform = (typeof process !== 'undefined' && process.platform) || 'win32';
  if (platform !== 'win32') {
    return await _launchUnix(rawName, name, entryKey, entry, platform);
  }

  // ── 4. Windows cascaded launcher ──
  return await _launchWindows(rawName, name, entryKey, entry);
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
  // Build list of exe targets to try
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
    // Also try name-based guesses
    const nameVariants = [rawName, name].flatMap(n => [`${n}.exe`, n]);
    for (const v of nameVariants) {
      if (!targets.includes(v)) targets.push(v);
    }
  }
  const primaryExe = targets[0] || `${name}.exe`;

  // ── Check cache first ──
  const cacheKey = entryKey || name;
  let cachedPath = appPathCache[cacheKey] || _fuzzyCacheLookup(name);
  if (cachedPath) {
    _log('info', `Cache hit: "${name}" → ${cachedPath}`);
    const r = await window.electronAPI.openPath(cachedPath);
    if (r && (r.success === undefined || r.success === true)) {
      return { success: true, output: `${rawName} abierto.` };
    }
    _log('warn', `Cache stale para ${cacheKey}`);
    delete appPathCache[cacheKey];
  }

  _log('info', `Buscando ruta para "${name}" (targets: ${targets.slice(0, 3).join(', ')}...)`);

  // ── PowerShell cascaded search ──
  const targetsJson = targets.slice(0, 8).map(t => `'${t.replace(/'/g, "''")}'`).join(', ');
  const psCommand = `
    $ErrorActionPreference = 'SilentlyContinue';
    $foundPath = "";
    $targets = @(${targetsJson});
    $searchNames = @('${name.replace(/'/g, "''")}', '${(entryKey || name).replace(/'/g, "''")}');

    # 1. Get-Command
    foreach ($t in $targets) {
      $p = Get-Command $t -ErrorAction SilentlyContinue;
      if ($p -and $p.Source -and (Test-Path $p.Source)) { $foundPath = $p.Source; break; }
    }

    # 2. App Paths Registry
    if (-not $foundPath) {
      foreach ($t in $targets) {
        $regPaths = @(
          "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$t",
          "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$t",
          "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$t"
        );
        foreach ($rp in $regPaths) {
          try {
            if (Test-Path $rp) {
              $val = (Get-ItemProperty $rp -ErrorAction SilentlyContinue).'(default)';
              if ($val -and (Test-Path $val)) { $foundPath = $val; break; }
            }
          } catch {}
        }
        if ($foundPath) { break; }
      }
    }

    # 3. Common install paths
    if (-not $foundPath) {
      foreach ($sn in $searchNames) {
        foreach ($t in $targets) {
          $common = @(
            "$env:ProgramFiles\\$sn\\$t",
            "$env:ProgramFiles(x86)\\$sn\\$t",
            "$env:LocalAppData\\Programs\\$sn\\$t",
            "$env:ProgramFiles\\$sn\\$sn.exe",
            "$env:ProgramFiles(x86)\\$sn\\$sn.exe",
            "$env:LocalAppData\\Programs\\$sn\\$sn.exe",
            "$env:LocalAppData\\$sn\\$t",
            "$env:AppData\\$sn\\$t",
            "$env:ProgramFiles\\$t",
            "$env:ProgramFiles(x86)\\$t"
          );
          foreach ($p in $common) {
            try { if (Test-Path $p) { $foundPath = $p; break; } } catch {}
          }
          if ($foundPath) { break; }
        }
        if ($foundPath) { break; }
      }
    }

    # 4. WindowsApps (UWP/Store)
    if (-not $foundPath) {
      foreach ($sn in $searchNames) {
        $uwp = "$env:LocalAppData\\Microsoft\\WindowsApps";
        if (Test-Path $uwp) {
          $item = Get-ChildItem -Path $uwp -Filter "*$sn*" -ErrorAction SilentlyContinue | Select-Object -First 1;
          if ($item) { $foundPath = $item.FullName; break; }
        }
      }
    }

    # 5. Launch
    if ($foundPath) {
      try {
        Start-Process -FilePath $foundPath -WindowStyle Normal -ErrorAction Stop;
        Write-Output "OK:$foundPath";
      } catch {
        Write-Output "ERR:$($_.Exception.Message)";
        exit 1;
      }
    } else {
      Write-Output "NOTFOUND";
      exit 1;
    }
  `;

  const psResult = await window.electronAPI.runPowerShell(psCommand);
  if (psResult.success && psResult.output && psResult.output.startsWith('OK:')) {
    const found = (psResult.output.match(/^OK:(.+)/) || [])[1];
    if (found) {
      appPathCache[cacheKey] = found.trim();
      saveAppPathCache();
      return { success: true, output: `${rawName} abierto.` };
    }
  }

  // ── Fallback: where.exe ──
  try {
    const whereResult = await window.electronAPI.runCmd(`where "${primaryExe}" 2>nul`);
    if (whereResult.success && whereResult.output && whereResult.output.trim()) {
      const exePath = whereResult.output.trim().split('\n')[0].trim();
      if (exePath && exePath.includes('\\')) {
        const r = await window.electronAPI.runPowerShell(
          `Start-Process -FilePath '${exePath.replace(/'/g, "''")}' -WindowStyle Normal; Write-Output "OK"`
        );
        if (r.success) {
          appPathCache[cacheKey] = exePath;
          saveAppPathCache();
          return { success: true, output: `${rawName} abierto.` };
        }
      }
    }
  } catch (e) { _log('warn', `where.exe fallback: ${e.message}`); }

  // ── Fallback: Start Menu shortcuts ──
  _log('info', `Buscando acceso directo para "${name}"...`);
  const shortcutCmd = `
    $ErrorActionPreference = 'SilentlyContinue';
    $q = '${name.replace(/'/g, "''")}'; $result = "";
    $dirs = @(
      "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
      "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
      [Environment]::GetFolderPath("Desktop"),
      "$env:LocalAppData\\Microsoft\\WindowsApps"
    );
    foreach ($d in $dirs) {
      $items = Get-ChildItem -Path $d -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -match [regex]::Escape($q) -or $_.BaseName -match ($q -split ' ' | Where-Object {$_.Length -gt 2} | Select-Object -First 1) };
      if ($items) { $result = ($items | Select-Object -First 1).FullName; break; }
    }
    if ($result) { Invoke-Item $result; Write-Output "OK:$result" } else { Write-Output "NOTFOUND" }
  `;
  const shortcutResult = await window.electronAPI.runPowerShell(shortcutCmd);
  if (shortcutResult.success && shortcutResult.output && !shortcutResult.output.startsWith('NOTFOUND')) {
    const match = shortcutResult.output.match(/^OK:(.+)/);
    if (match) {
      appPathCache[cacheKey] = match[1].trim();
      saveAppPathCache();
      return { success: true, output: `${rawName} abierto.` };
    }
  }

  // ── Final fallback: web ──
  if (entry && entry.url) {
    _log('info', `Fallback web: ${entry.url}`);
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${rawName} abierto en el navegador.` : `Error: ${r.output}` };
  }

  const suggestions = [];
  if (entry) {
    if (entry.exe) suggestions.push(`Verifica que ${rawName} esté instalado`);
    if (entry.url) suggestions.push(`Web: ${entry.url}`);
  } else {
    suggestions.push(`¿Es "${rawName}" el nombre correcto?`);
  }
  return { 
    success: false, 
    output: `No se pudo abrir "${rawName}". ${suggestions.join(' | ')}` 
  };
}
