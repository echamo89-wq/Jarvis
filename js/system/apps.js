import { executePowerShellCommand, executeWithFallback } from './powershell.js';

let appPathCache = {};

const KNOWN_APPS = {
  chrome:           { exe: 'chrome.exe',          url: null,                    names: ['chrome', 'google chrome', 'navegador', 'explorador', 'browser', 'internet', 'web'] },
  firefox:          { exe: 'firefox.exe',         url: null,                    names: ['firefox', 'mozilla firefox', 'mozilla'] },
  edge:             { exe: 'msedge.exe',          url: null,                    names: ['edge', 'microsoft edge', 'ms edge'] },
  spotify:          { exe: 'Spotify.exe',         url: null,                    names: ['spotify', 'spotify music', 'musica', 'música'] },
  code:             { exe: 'Code.exe',            url: null,                    names: ['code', 'vs code', 'visual studio code', 'vscode', 'codigo'] },
  discord:          { exe: 'Discord.exe',         url: null,                    names: ['discord'] },
  steam:            { exe: 'steam.exe',           url: null,                    names: ['steam'] },
  whatsapp:         { exe: 'WhatsApp.exe',        url: null,                    names: ['whatsapp', 'whats app', 'wsp'] },
  telegram:         { exe: 'Telegram.exe',        url: null,                    names: ['telegram', 'telégram'] },
  obsidian:         { exe: 'Obsidian.exe',        url: null,                    names: ['obsidian'] },
  slack:            { exe: 'slack.exe',           url: null,                    names: ['slack'] },
  zoom:             { exe: 'Zoom.exe',            url: null,                    names: ['zoom', 'zoom meetings'] },
  calculator:       { exe: 'calc.exe',            url: null,                    names: ['calculadora', 'calculator', 'calc'] },
  notepad:          { exe: 'notepad.exe',         url: null,                    names: ['notepad', 'bloc de notas', 'block de notas', 'notas'] },
  paint:            { exe: 'mspaint.exe',         url: null,                    names: ['paint', 'mspaint', 'dibujo'] },
  terminal:         { exe: 'WindowsTerminal.exe', url: null,                    names: ['terminal', 'windows terminal', 'consola'] },
  cmd:              { exe: 'cmd.exe',             url: null,                    names: ['cmd', 'simbolo del sistema', 'command prompt'] },
  powershell:       { exe: 'powershell.exe',      url: null,                    names: ['powershell', 'power shell'] },
  explorer:         { exe: 'explorer.exe',        url: null,                    names: ['explorer', 'file explorer', 'windows explorer', 'archivos', 'explorador'] },
  settings:         { exe: null,                  url: 'ms-settings:',          names: ['settings', 'configuracion', 'ajustes', 'configuración'] },
  taskmanager:      { exe: 'taskmgr.exe',         url: null,                    names: ['task manager', 'administrador de tareas', 'taskmanager', 'admin tareas'] },
  control:          { exe: 'control',             url: null,                    names: ['control panel', 'panel de control'] },
  word:             { exe: 'WINWORD.EXE',         url: null,                    names: ['word', 'microsoft word', 'microsoftword'] },
  excel:            { exe: 'EXCEL.EXE',           url: null,                    names: ['excel', 'microsoft excel', 'microsoftexcel'] },
  powerpoint:       { exe: 'POWERPNT.EXE',        url: null,                    names: ['powerpoint', 'microsoft powerpoint', 'ppt', 'presentaciones'] },
  youtube:          { exe: null,                  url: 'https://youtube.com',   names: ['youtube', 'yt', 'you tube'] },
  gmail:            { exe: null,                  url: 'https://gmail.com',     names: ['gmail', 'correo gmail', 'mail', 'correo'] },
  maps:             { exe: null,                  url: 'https://maps.google.com', names: ['maps', 'google maps', 'mapas'] },
  drive:            { exe: null,                  url: 'https://drive.google.com', names: ['drive', 'google drive'] },
  netflix:          { exe: null,                  url: 'https://netflix.com',   names: ['netflix', 'netflix'] },
  instagram:        { exe: null,                  url: 'https://instagram.com', names: ['instagram', 'ig', 'insta'] },
  twitter:          { exe: null,                  url: 'https://twitter.com',   names: ['twitter', 'x', 'x.com'] },
  facebook:         { exe: null,                  url: 'https://facebook.com',  names: ['facebook', 'fb', 'face'] },
  chatgpt:          { exe: null,                  url: 'https://chat.openai.com', names: ['chatgpt', 'openai', 'gpt', 'chat gpt'] },
  antigravity:      { exe: 'antigravity.exe',     url: null,                    names: ['antigravity', 'anti gravity', 'antygravity', 'herramienta de google antigravity'] },
  obs:              { exe: 'obs64.exe',           url: null,                    names: ['obs', 'obs studio', 'open broadcaster', 'streaming'] },
  vlc:              { exe: 'vlc.exe',             url: null,                    names: ['vlc', 'vlc media player', 'reproductor'] },
  photoshop:        { exe: 'Photoshop.exe',       url: null,                    names: ['photoshop', 'ps', 'adobe photoshop'] },
  illustrator:      { exe: 'Illustrator.exe',     url: null,                    names: ['illustrator', 'ai', 'adobe illustrator'] },
  figma:            { exe: 'Figma.exe',           url: null,                    names: ['figma', 'figma desktop'] },
  unity:            { exe: 'Unity.exe',           url: null,                    names: ['unity', 'unity hub', 'unity editor'] },
};

import { createLogger } from '../utils/logger.js';
const _log = createLogger('APPS');

export async function scanAllInstalledApps() {
  _log('info', 'Escaneando todas las apps instaladas...');
  const psCmd = `
    $ErrorActionPreference = 'SilentlyContinue';
    $results = @{};
    # Scan Start Menu shortcuts
    $dirs = @(
      "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
      "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
      [Environment]::GetFolderPath("Desktop")
    );
    foreach ($d in $dirs) {
      $lnks = Get-ChildItem -Path $d -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue;
      foreach ($lnk in $lnks) {
        $base = $lnk.BaseName.ToLower().Trim();
        $target = $lnk.TargetPath;
        if ($target -and (Test-Path $target)) {
          $results[$base] = $target;
        }
      }
    }
    # Scan App Paths registry
    $regPaths = @("HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths","HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths");
    foreach ($rp in $regPaths) {
      if (Test-Path $rp) {
        $items = Get-ChildItem -Path $rp -ErrorAction SilentlyContinue;
        foreach ($item in $items) {
          $val = (Get-ItemProperty $item.PSPath).'(default)';
          if ($val -and (Test-Path $val)) {
            $results[$item.PSChildName.ToLower().Replace('.exe','')] = $val;
          }
        }
      }
    }
    # Return as JSON
    $results | ConvertTo-Json -Compress
  `;
  try {
    const result = await window.electronAPI.runPowerShell(psCmd);
    if (result.success && result.output) {
      const parsed = JSON.parse(result.output);
      let count = 0;
      Object.keys(parsed).forEach(k => {
        const v = parsed[k].trim();
        if (v && !appPathCache[k]) {
          appPathCache[k] = v;
          count++;
        }
      });
      _log('info', `Scan completado: ${count} apps nuevas encontradas (total cache: ${Object.keys(appPathCache).length})`);
      // Persist
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
    scanAllInstalledApps().catch(e => _log('warn', `background scan: ${e.message}`));
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

function _matchEntry(name) {
  let entryKey = Object.keys(KNOWN_APPS).find(k => k === name || KNOWN_APPS[k].names.includes(name));
  if (!entryKey) {
    entryKey = Object.keys(KNOWN_APPS).find(k =>
      KNOWN_APPS[k].names.some(n => name.includes(n) || n.includes(name))
    );
  }
  if (!entryKey) {
    entryKey = Object.keys(KNOWN_APPS).find(k => name.includes(k) || k.includes(name));
  }
  return entryKey;
}

function _fuzzyCacheLookup(name) {
  // Exact match
  if (appPathCache[name]) return appPathCache[name];
  // Check if any cache key contains the name or vice versa
  const keys = Object.keys(appPathCache);
  for (const k of keys) {
    if (k === name || k.includes(name) || name.includes(k)) return appPathCache[k];
  }
  // Check normalized (remove spaces, special chars)
  const norm = name.replace(/[\s\-_.]/g, '').toLowerCase();
  for (const k of keys) {
    const kN = k.replace(/[\s\-_.]/g, '').toLowerCase();
    if (kN === norm || kN.includes(norm) || norm.includes(kN)) return appPathCache[k];
  }
  return null;
const PLATFORM_APPS = {
  darwin: {
    chrome: ['Google Chrome', 'Brave Browser', 'Safari'],
    terminal: ['Terminal', 'iTerm'],
    spotify: ['Spotify'],
    code: ['Visual Studio Code'],
    calculator: ['Calculator'],
    notepad: ['TextEdit'],
    explorer: ['Finder'],
    settings: ['System Settings']
  },
  linux: {
    chrome: ['google-chrome', 'firefox', 'chromium-browser'],
    terminal: ['gnome-terminal', 'xterm', 'konsole', 'xfce4-terminal'],
    spotify: ['spotify'],
    code: ['code'],
    calculator: ['gnome-calculator', 'kcalc'],
    notepad: ['gedit', 'nano', 'kate'],
    explorer: ['nautilus', 'dolphin', 'thunar']
  }
};

export async function launchApp(appName) {
  const name = appName.toLowerCase().trim();
  const entryKey = _matchEntry(name);
  const entry = entryKey ? KNOWN_APPS[entryKey] : null;

  // 1. Web application redirect fallback
  if (entry && !entry.exe && entry.url) {
    _log('info', `Web app: ${entry.url}`);
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${appName} abierto en el navegador.` : `Error: ${r.output}` };
  }

  // 2. Non-Windows (macOS & Linux) Native Launcher Support
  const platform = process.platform;
  if (platform !== 'win32') {
    _log('info', `Lanzador nativo UNIX para "${name}" en platform ${platform}`);
    const mapping = PLATFORM_APPS[platform] || {};
    const candidates = mapping[entryKey] || [name];
    
    if (platform === 'darwin') { // macOS
      for (const app of candidates) {
        const r = await window.electronAPI.runCmd(`open -a "${app}"`);
        if (r.success) return { success: true, output: `${appName} abierto.` };
      }
      // Generico
      const r = await window.electronAPI.runCmd(`open -a "${name}"`);
      if (r.success) return { success: true, output: `${appName} abierto.` };
    } else { // Linux
      for (const app of candidates) {
        const r = await window.electronAPI.runCmd(`${app} &`);
        if (r.success) return { success: true, output: `${appName} abierto.` };
      }
    }
    
    if (entry && entry.url) {
      _log('info', `Fallback a web (UNIX): ${entry.url}`);
      const r = await window.electronAPI.openBrowser(entry.url);
      return { success: r.success, output: r.success ? `${appName} abierto en el navegador.` : `Error: ${r.output}` };
    }
    return { success: false, output: `No se pudo abrir "${appName}" en tu sistema UNIX.` };
  }

  // 3. Windows Native Cascaded Launcher (with robust fallbacks)
  const targets = [];
  if (entryKey === 'chrome') {
    targets.push('chrome.exe', 'msedge.exe', 'firefox.exe');
  } else if (entryKey === 'terminal') {
    targets.push('WindowsTerminal.exe', 'wt.exe', 'powershell.exe', 'cmd.exe');
  } else {
    if (entry && entry.exe) targets.push(entry.exe);
    targets.push(`${name}.exe`, name);
  }
  const primaryExe = targets[0];

  // Check cache with fuzzy matching
  const cacheKey = entryKey || name;
  let cachedPath = appPathCache[cacheKey];
  if (!cachedPath) cachedPath = _fuzzyCacheLookup(name);
  if (cachedPath) {
    _log('info', `Cache hit para "${name}" → ${cachedPath}`);
    const r = await window.electronAPI.openPath(cachedPath);
    if (r.success === undefined || r.success === true) {
      appPathCache[cacheKey] = cachedPath;
      return { success: true, output: `${appName} abierto.` };
    }
    _log('warn', `Cache stale para ${cacheKey}: ${r.output || r}`);
    delete appPathCache[cacheKey];
  }

  _log('info', `Buscando ruta de "${name}" con cascada de objetivos: ${targets.join(', ')}...`);
  
  const targetsJson = targets.map(t => `'${t}'`).join(', ');
  const psCommand = `
    $ErrorActionPreference = 'SilentlyContinue';
    $foundPath = "";
    $targets = @(${targetsJson});
    $names = @('${name}', '${entryKey || name}');

    # 1. Probar Get-Command
    foreach ($t in $targets) {
      $p = Get-Command $t;
      if ($p -and $p.Source) { $foundPath = $p.Source; break; }
    }

    # 2. Probar App Paths en registro
    if (-not $foundPath) {
      foreach ($t in $targets) {
        $regPaths = @(
          "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$t",
          "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$t"
        );
        foreach ($rp in $regPaths) {
          try {
            if (Test-Path $rp) {
              $val = (Get-ItemProperty $rp -Name "(default)" -ErrorAction SilentlyContinue)."(default)";
              if ($val -and (Test-Path $val)) { $foundPath = $val; break; }
            }
          } catch {}
        }
        if ($foundPath) { break; }
      }
    }

    # 3. Probar carpetas comunes
    if (-not $foundPath) {
      foreach ($n in $names) {
        foreach ($t in $targets) {
          $common = @(
            "$env:ProgramFiles\\$n\\$t",
            "$env:ProgramFiles(x86)\\$n\\$t",
            "$env:LocalAppData\\Programs\\$n\\$t",
            "$env:ProgramFiles\\$n\\$n.exe",
            "$env:ProgramFiles(x86)\\$n\\$n.exe",
            "$env:LocalAppData\\Programs\\$n\\$n.exe"
          );
          foreach ($p in $common) {
            try {
              if (Test-Path $p) { $foundPath = $p; break; }
            } catch {}
          }
          if ($foundPath) { break; }
        }
        if ($foundPath) { break; }
      }
    }

    # 4. Iniciar proceso
    if ($foundPath) {
      try {
        Start-Process -FilePath $foundPath -WindowStyle Normal;
        Write-Output "OK:$foundPath";
      } catch {
        Write-Error $_.Exception.Message;
        exit 1;
      }
    } else {
      Write-Output "NOTFOUND";
      exit 1;
    }
  `;

  const psResult = await window.electronAPI.runPowerShell(psCommand);
  if (psResult.success && psResult.output && psResult.output.startsWith('OK:')) {
    const match = psResult.output.match(/^OK:(.+)/);
    if (match) {
      const found = match[1].trim();
      appPathCache[entryKey || name] = found;
      await saveAppPathCache();
      return { success: true, output: `${appName} abierto.` };
    }
  }

  // Fallback con where.exe
  try {
    const whereResult = await window.electronAPI.runCmd(`where ${primaryExe}`);
    if (whereResult.success) {
      const exePath = whereResult.output.trim().split('\n')[0];
      const r = await window.electronAPI.runPowerShell(`
        try { Start-Process -FilePath '${exePath}' -WindowStyle Normal; Write-Output "OK" }
        catch { Write-Error $_.Exception.Message; exit 1 }
      `);
      if (r.success) {
        appPathCache[entryKey || name] = exePath;
        await saveAppPathCache();
        return { success: true, output: `${appName} abierto.` };
      }
    }
  } catch (e) { _log('warn', `where.exe fallback falló: ${e.message}`); }

  // Fallback PWA / Accesos directos
  _log('info', `Buscando PWA y accesos directos para "${name}"...`);
  const pwaCmd = `
    $ErrorActionPreference = 'SilentlyContinue';
    $q = '${name}'; $result = "";
    $dirs = @("$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs","$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",[Environment]::GetFolderPath("Desktop"));
    foreach ($d in $dirs) { $items = Get-ChildItem -Path $d -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match $q }; if ($items) { $result = ($items | Select-Object -First 1).FullName; break; } }
    if (-not $result) { $items = Get-ChildItem -Path "$env:LOCALAPPDATA\\Microsoft\\WindowsApps" -Filter "*.exe" -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match $q }; if ($items) { $result = ($items | Select-Object -First 1).FullName } }
    if (-not $result) { foreach ($wd in @("$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Web Applications","$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Web Applications")) { if (Test-Path $wd) { $subs = Get-ChildItem -Path $wd -Directory -ErrorAction SilentlyContinue; foreach ($s in $subs) { if ($s.Name -match $q) { $urlFile = Get-ChildItem -Path $s.FullName -Filter "*.url" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($urlFile) { $result = $urlFile.FullName; break } } } } if ($result) { break } } }
    if ($result) { Invoke-Item $result; Write-Output "OK:$result" } else { Write-Output "NOTFOUND" }
  `;
  const pwaResult = await window.electronAPI.runPowerShell(pwaCmd);
  if (pwaResult.success && !pwaResult.output.startsWith('NOTFOUND')) {
    const match = pwaResult.output.match(/^OK:(.+)/);
    if (match) {
      appPathCache[entryKey || name] = match[1].trim();
      await saveAppPathCache();
      return { success: true, output: `${appName} abierto.` };
    }
  }

  // Fallback final a web
  if (entry && entry.url) {
    _log('info', `Fallback final a web: ${entry.url}`);
    const r = await window.electronAPI.openBrowser(entry.url);
    return { success: r.success, output: r.success ? `${appName} abierto en el navegador.` : `Error: ${r.output}` };
  }

  return { success: false, output: `No se pudo encontrar "${name}". Verifica que esté instalado o usando su web (${name}.com).` };
}
