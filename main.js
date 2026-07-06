const { app, BrowserWindow, ipcMain, shell, Notification, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execFile } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const { registerSecureStorageIpc, loadCredentials, saveCredentials } = require('./main/secure-storage');
const { registerPsIpc } = require('./main/ps-executor');

try {
  const env = fs.readFileSync('.env', 'utf8');
  env.split('\n').forEach(line => {
    const i = line.indexOf('=');
    if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
} catch(e) {}

// Precargar API Key desde almacenamiento seguro si no existe en .env
try {
  const creds = loadCredentials();
  if (creds && creds.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = creds.GEMINI_API_KEY;
  }
} catch (e) {
  console.error('[MAIN] Error al cargar API Key persistente desde secure storage:', e.message);
}

let geminiWs = null;
let _childProcesses = [];  // track ad-hoc spawned processes for cleanup
let _backendServerProc = null;

function _trackChildProcess(proc) {
  if (proc && typeof proc.kill === 'function') {
    _childProcesses.push(proc);
    proc.once('exit', () => {
      _childProcesses = _childProcesses.filter(p => p !== proc);
    });
  }
  return proc;
}

function _startBackendServer() {
  // En producción (app empaquetada), el servidor backend no se usa.
  // La app se conecta directamente a la API de Gemini vía WebSocket.
  // Intentar spawnearlo con process.execPath (Jarvis.exe) causa ENOENT
  // porque un ejecutable de Electron no puede actuar como intérprete Node.
  if (app.isPackaged) {
    console.log('[MAIN] Producción: servidor backend omitido (app usa Gemini WS directo).');
    return null;
  }

  if (_backendServerProc && _backendServerProc.exitCode === null) {
    return _backendServerProc;
  }

  const serverPath = path.join(__dirname, 'server');
  const entrypoint = path.join(serverPath, 'index.js');

  if (!fs.existsSync(entrypoint)) {
    console.warn('[MAIN] Servidor interno no encontrado en server/index.js');
    return null;
  }

  try {
    _backendServerProc = spawn('node', [entrypoint], {
      cwd: serverPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: process.env.PORT || '3001', NODE_ENV: 'development' }
    });

    _trackChildProcess(_backendServerProc);

    _backendServerProc.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[SERVER] ${msg}`);
    });
    _backendServerProc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[SERVER ERR] ${msg}`);
    });
    _backendServerProc.on('exit', (code, signal) => {
      console.warn(`[MAIN] Servidor interno detenido: code=${code} signal=${signal}`);
      _backendServerProc = null;
    });

    console.log('[MAIN] Arrancando servidor interno de JARVIS (desarrollo)...');
    return _backendServerProc;
  } catch (err) {
    console.error('[MAIN] Error al iniciar servidor interno:', err.message);
    _backendServerProc = null;
    return null;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // ─── Redirigir console del renderer → terminal ──────────────
  // Adjuntado AQUI (antes del loadFile) para capturar TODOS los mensajes
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const ts = new Date().toLocaleTimeString('es', { hour12: false });
    const src = sourceId ? sourceId.replace(/.*[\/\\]/, '').replace(/\?.*$/, '') : '';
    const loc = src ? ` [${src}:${line}]` : '';
    const msg = `${message}${loc}`;
    let formatted = '';
    if (level === 3) {
      formatted = `[UI-ERR] ${msg}\n`;
      console.error(`\x1b[31m[${ts}] [UI-ERR] ${msg}\x1b[0m`);
    } else if (level === 2) {
      formatted = `[UI-WRN] ${msg}\n`;
      console.warn(`\x1b[33m[${ts}] [UI-WRN] ${msg}\x1b[0m`);
    } else if (level === 0) {
      if (/\[(BOOT|WS|GUARDIAN|RECORDER|AUDIO|EXECUTOR|MAIN|TOOLS|INT)\]/.test(message)) {
        formatted = `[UI-VRB] ${msg}\n`;
        console.log(`\x1b[2m[${ts}] [UI-VRB] ${msg}\x1b[0m`);
      }
    } else {
      formatted = `[UI] ${msg}\n`;
      console.log(`\x1b[36m[${ts}] [UI] ${msg}\x1b[0m`);
    }
    if (formatted) {
      try {
        fs.appendFileSync(path.join(__dirname, 'ui_logs.txt'), `[${ts}] ${formatted}`);
      } catch(e) {}
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, url) => {
    console.error(`\x1b[31m[MAIN] RENDERER FAIL LOAD: ${errorDescription} (${errorCode}) url=${url}\x1b[0m`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`\x1b[31m[MAIN] RENDERER CRASHED: reason=${details.reason} exitCode=${details.exitCode}\x1b[0m`);
  });

  // Abrir target="_blank" en el navegador del usuario
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile('renderer.html');

  // Abre las DevTools si está en modo desarrollo (por defecto activado localmente)
  if (process.env.NODE_ENV === 'development' || process.env.DEV_TOOLS === 'true') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (process.argv.includes('--reset')) {
    // Limpiar .env y API key del proceso
    try {
      const envPath = path.join(__dirname, '.env');
      fs.writeFileSync(envPath, '# Reset por --reset\n');
    } catch(e) {}
    delete process.env.GEMINI_API_KEY;
    console.log('[MAIN] --reset: API key y .env limpiados');

    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`
        if (!sessionStorage.getItem('jarvis_reset_done')) {
          sessionStorage.setItem('jarvis_reset_done', '1');
          localStorage.clear();
          location.reload();
        }
      `).catch(() => {});
    });
  }

  return mainWindow;
}

app.whenReady().then(() => {
  _startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  console.log('\x1b[32m========================================\x1b[0m');
  console.log('\x1b[32m   JARVIS -- SISTEMAS INICIANDO         \x1b[0m');
  console.log('\x1b[32m========================================\x1b[0m');
});

function _cleanupProcesses() {
  if (typeof cleanupPs === 'function') cleanupPs();
  if (localAudioProc && localAudioProc.exitCode === null) {
    try { localAudioProc.kill(); } catch (e) {}
    localAudioProc = null;
  }
  if (_ttsProc && _ttsProc.exitCode === null) {
    try { _ttsProc.stdin.write("___EXIT___\n"); } catch (e) {}
    try { _ttsProc.kill(); } catch (e) {}
    _ttsProc = null;
  }
  if (_oauthServer) {
    try { _oauthServer.close(); } catch (e) {}
    _oauthServer = null;
  }
  _childProcesses.forEach(proc => {
    if (proc.exitCode === null) {
      try { proc.kill(); } catch (e) {}
    }
  });
  _childProcesses = [];
}

app.on('before-quit', _cleanupProcesses);

app.on('window-all-closed', () => {
  _cleanupProcesses();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// Handle window controls from custom title bar
ipcMain.on('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'close') {
    win.close();
  } else if (action === 'minimize') {
    win.minimize();
  }
});

const { cleanupPs } = registerPsIpc((proc) => _trackChildProcess(proc));

// Abrir URL — nativo Electron (shell.openExternal, instantáneo, sin spawn de proceso)
ipcMain.handle('open-browser', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, output: err.message };
  }
});

// System notification via Electron native API
ipcMain.handle('show-notification', async (event, { title, body }) => {
  try {
    const notif = new Notification({ title: title || 'JARVIS', body: body || '' });
    notif.show();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open file/document/folder via shell (native, instant, zero risk)
ipcMain.handle('open-path', async (event, targetPath) => {
  try {
    const error = await shell.openPath(targetPath);
    return error ? { success: false, output: error } : { success: true, output: `Abierto: ${targetPath}` };
  } catch (err) {
    return { success: false, output: err.message };
  }
});

// ─── Safe File Operations (path-validated, no raw PS injection) ──────────
const ALLOWED_FILE_ROOTS = [
  process.env.USERPROFILE,
  process.env.HOMEDRIVE + '\\',
  app.getPath('temp'),
  app.getPath('desktop'),
  app.getPath('documents'),
  app.getPath('downloads'),
  path.join(process.env.USERPROFILE, 'Desktop'),
  path.join(process.env.USERPROFILE, 'Documents'),
  path.join(process.env.USERPROFILE, 'Downloads'),
  path.join(process.env.USERPROFILE, 'Pictures'),
  path.join(process.env.USERPROFILE, 'Music'),
  path.join(process.env.USERPROFILE, 'Videos'),
  path.join(process.env.USERPROFILE, 'OneDrive'),
];

function _isPathSafe(targetPath) {
  try {
    const resolved = path.resolve(targetPath);
    const normalized = resolved.toLowerCase();
    return ALLOWED_FILE_ROOTS.some(root => root && normalized.startsWith(root.toLowerCase()));
  } catch { return false; }
}

ipcMain.handle('file-read', async (event, filePath) => {
  try {
    if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
    if (!fs.existsSync(filePath)) return { success: false, output: 'ERR_FILE_NOT_FOUND' };
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, output: content };
  } catch (err) {
    return { success: false, output: `Error: ${err.message}` };
  }
});

ipcMain.handle('file-write', async (event, filePath, content) => {
  try {
    if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
    if (typeof content !== 'string') return { success: false, output: 'ERR_INVALID_CONTENT' };
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, output: `Archivo escrito: ${filePath}` };
  } catch (err) {
    return { success: false, output: `Error: ${err.message}` };
  }
});

ipcMain.handle('file-delete', async (event, filePath) => {
  try {
    if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
    if (!fs.existsSync(filePath)) return { success: false, output: 'ERR_FILE_NOT_FOUND' };
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return { success: true, output: `Eliminado: ${filePath}` };
  } catch (err) {
    return { success: false, output: `Error: ${err.message}` };
  }
});

ipcMain.handle('file-list', async (event, dirPath, pattern) => {
  try {
    if (!_isPathSafe(dirPath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
    if (!fs.existsSync(dirPath)) return { success: false, output: 'ERR_PATH_NOT_FOUND' };
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const filter = pattern ? new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;
    const result = items
      .filter(i => !filter || filter.test(i.name))
      .map(i => {
        const s = fs.statSync(path.join(dirPath, i.name));
        return `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}${i.isFile() ? ` (${s.size} bytes)` : ''} ${s.mtime.toISOString().slice(0, 10)}`;
      })
      .join('\n');
    return { success: true, output: result || '(vacío)' };
  } catch (err) {
    return { success: false, output: `Error: ${err.message}` };
  }
});

ipcMain.handle('file-info', async (event, filePath) => {
  try {
    if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
    if (!fs.existsSync(filePath)) return { success: false, output: 'ERR_FILE_NOT_FOUND' };
    const s = fs.statSync(filePath);
    const info = [
      `Nombre: ${path.basename(filePath)}`,
      `Tamaño: ${s.size} bytes`,
      `Creado: ${s.birthtime.toISOString()}`,
      `Modificado: ${s.mtime.toISOString()}`,
      `Es directorio: ${s.isDirectory() ? 'Sí' : 'No'}`,
    ].join('\n');
    return { success: true, output: info };
  } catch (err) {
    return { success: false, output: `Error: ${err.message}` };
  }
});

// ─── Wallpaper change via safe PS (whitelisted, no blocklist) ──────────────
ipcMain.handle('set-wallpaper', async (event, type, value) => {
  try {
    let psCmd = '';
    if (type === 'color') {
      const parts = value.split(' ');
      if (parts.length !== 3 || parts.some(p => isNaN(parseInt(p)))) return { success: false, output: 'ERR_INVALID_COLOR' };
      psCmd = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }
'@; $p='HKCU:\\Control Panel\\Colors'; New-ItemProperty -Path $p -Name Background -PropertyType String -Value '${parts[0]} ${parts[1]} ${parts[2]}' -Force; [W]::SystemParametersInfo(20,0,'${parts[0]} ${parts[1]} ${parts[2]}',2); Write-Output 'OK'`;
    } else if (type === 'url') {
      const escaped = value.replace(/'/g, "''");
      psCmd = `$url='${escaped}'; $img="$env:TEMP\\jarvis_wp_$(Get-Date -f yyyyMMdd_HHmmss).jpg"; try { $wc=New-Object -ComObject MSXML2.ServerXMLHTTP; $wc.open('GET',$url,$false); $wc.send(); [IO.File]::WriteAllBytes($img, [Text.Encoding]::ASCII.GetBytes($wc.responseText)) } catch { }; if (Test-Path $img) { Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class W2 { [DllImport("user32.dll")] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }
'@; [W2]::SystemParametersInfo(20,0,$img,2); Write-Output 'OK' } else { Write-Output 'ERR_DOWNLOAD_FAILED' }`;
    } else return { success: false, output: 'ERR_INVALID_TYPE' };
    const tmpFile = path.join(app.getPath('temp'), `jarvis_wp_${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, psCmd, 'utf8');
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
        { timeout: 15000, encoding: 'utf8' }, (error, stdout) => {
        try { fs.unlinkSync(tmpFile); } catch(e) {}
        if (stdout && stdout.includes('OK')) resolve({ success: true, output: 'Fondo cambiado.' });
        else resolve({ success: false, output: stdout || error?.message || 'Error al cambiar fondo' });
      });
    });
  } catch (err) {
    return { success: false, output: `Error: ${err.message}` };
  }
});

function _findFilesRecursive(dir, pattern, maxResults, results = [], depth = 0, visited = new Set()) {
  if (depth > 8) return results;
  try {
    const resolvedDir = fs.realpathSync(dir);
    if (visited.has(resolvedDir)) return results;
    visited.add(resolvedDir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          const s = fs.statSync(fullPath);
          results.push(`${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${fullPath} (${s.size} bytes) ${s.mtime.toISOString().slice(0, 10)}`);
        }
      } catch (e) {
        // stat failed - skip this entry
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        _findFilesRecursive(fullPath, pattern, maxResults, results, depth + 1, visited);
      }
    }
  } catch (e) {
    // Permission denied or other errors - skip silently
  }
  return results;
}

ipcMain.handle('file-find', async (event, dirPath, searchPattern, maxResults = 20) => {
  try {
    if (!_isPathSafe(dirPath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
    if (!fs.existsSync(dirPath)) return { success: false, output: 'ERR_PATH_NOT_FOUND' };
    const safeMax = Math.min(maxResults, 100);
    const results = _findFilesRecursive(dirPath, searchPattern, safeMax);
    return { success: true, output: results.join('\n') || `No se encontraron archivos con "${searchPattern}" en ${dirPath}` };
  } catch (err) {
    return { success: false, output: `Error: ${err.message}` };
  }
});

// Fetch URL content — modo normal (HTML stripped) o raw (respuesta exacta para APIs)
const MAX_FETCH_REDIRECTS = 3;
function _fetchUrl(urlStr, raw, redirectCount = 0) {
  return new Promise((resolve) => {
    if (!urlStr) return resolve({ success: false, output: 'URL vacía' });
    try {
      const parsedUrl = new URL(urlStr);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      if (raw) {
        headers['Accept'] = 'application/json, text/plain, */*';
      } else {
        headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      }

      const request = client.get(urlStr, { timeout: 15000, headers }, (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location && redirectCount < MAX_FETCH_REDIRECTS) {
          const nextUrl = new URL(res.headers.location, parsedUrl).toString();
          res.destroy();
          resolve(_fetchUrl(nextUrl, raw, redirectCount + 1));
          return;
        }

        if (statusCode >= 400) {
          res.destroy();
          return resolve({ success: false, output: `HTTP ${statusCode} ${res.statusMessage || ''}`.trim() });
        }

        let data = '';
        const maxSize = 200 * 1024;
        res.on('data', chunk => {
          data += chunk.toString('utf8');
          if (data.length > maxSize) { data = data.substring(0, maxSize); res.destroy(); }
        });
        res.on('end', () => {
          if (raw) {
            resolve({ success: true, output: data.substring(0, 30000) });
            return;
          }
          const text = data.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 5000);
          resolve({ success: true, output: text.substring(0, 3000) });
        });
      });

      request.on('error', (err) => resolve({ success: false, output: err.message }));
      request.on('timeout', () => {
        request.destroy();
        resolve({ success: false, output: 'Request timeout' });
      });
    } catch (err) {
      resolve({ success: false, output: err.message });
    }
  });
}

ipcMain.handle('fetch-url', async (event, urlStr, raw) => {
  return _fetchUrl(urlStr, raw);
});

// Get current system date/time info
ipcMain.handle('get-system-time', async () => {
  const now = new Date();
  return {
    success: true,
    output: {
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dayOfWeek: now.toLocaleDateString(undefined, { weekday: 'long' }),
      timestamp: now.toISOString()
    }
  };
});

// Memory handlers (fs y path persistentes)
const MEMORY_FILE = path.join(app.getPath('userData'), 'jarvis_memory.json');

// Leer memoria
ipcMain.handle('memory-read', () => {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    } else {
      const defaultMemory = {
        userName: '',
        userContext: '',
        userRules: '',
        conversationSummaries: [],
        frequentCommands: {},
        systemCache: {},
        preferences: {},
        sessionCount: 0,
        firstSeen: new Date().toISOString()
      };
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(defaultMemory, null, 2), 'utf8');
      return defaultMemory;
    }
  } catch(e) {}
  return {
    userName: '',
    userContext: '',
    userRules: '',
    conversationSummaries: [],
    frequentCommands: {},
    systemCache: {},
    preferences: {},
    sessionCount: 0,
    firstSeen: new Date().toISOString()
  };
});

// Guardar memoria (atómico: temp file + rename)
ipcMain.handle('memory-write', (event, data) => {
  try {
    const tmpFile = MEMORY_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, MEMORY_FILE);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Loguear mensajes del renderizador en la terminal (vía logToTerminal)
ipcMain.on('log-to-terminal', (event, type, message) => {
  const timestamp = new Date().toLocaleTimeString('es', { hour12: false });
  const cleanMsg = typeof message === 'object' ? JSON.stringify(message) : String(message);
  if (type === 'error') {
    console.error(`\x1b[31m[${timestamp}] [ERR] ${cleanMsg}\x1b[0m`);
  } else if (type === 'warn') {
    console.warn(`\x1b[33m[${timestamp}] [WRN] ${cleanMsg}\x1b[0m`);
  } else if (type === 'conv_user') {
    console.log(`\n\x1b[36m\x1b[1m  TONY ›\x1b[0m \x1b[37m${cleanMsg}\x1b[0m`);
  } else if (type === 'conv_think') {
    console.log(`\x1b[2m  JARVIS (pensando) › ${cleanMsg}\x1b[0m`);
  } else if (type === 'conv_response') {
    console.log(`\x1b[32m\x1b[1m  JARVIS ›\x1b[0m \x1b[37m${cleanMsg}\x1b[0m\n`);
  } else if (type === 'conv_separator') {
    console.log(`\x1b[2m  ${'─'.repeat(50)}\x1b[0m`);
  } else if (type === 'info') {
    console.log(`\x1b[36m[${timestamp}] [INF] ${cleanMsg}\x1b[0m`);
  } else {
    console.log(`\x1b[2m[${timestamp}] [DBG] ${cleanMsg}\x1b[0m`);
  }
});

registerSecureStorageIpc();

// ─── Local Audio Engine (Python VAD+Whisper + Edge-TTS) ────
let localAudioProc = null;
let localAudioWin = null;

ipcMain.handle('start-local-audio', async (event) => {
  if (localAudioProc && localAudioProc.exitCode === null) {
    return { success: true, message: 'Ya en ejecución' };
  }

  localAudioWin = BrowserWindow.fromWebContents(event.sender);
  const scriptPath = path.join(__dirname, 'engine', 'vad_whisper.py');
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Script no encontrado: ${scriptPath}` };
  }

  // Intentar entorno virtual local primero (.venv o env), luego globales python, python3, py
  const localVenvPy = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
  const localEnvPy = path.join(__dirname, 'env', 'Scripts', 'python.exe');
  const pythons = [];
  if (fs.existsSync(localVenvPy)) pythons.push(localVenvPy);
  if (fs.existsSync(localEnvPy)) pythons.push(localEnvPy);
  pythons.push('python', 'python3', 'py');
  let started = false;

  for (const py of pythons) {
    try {
      localAudioProc = spawn(py, [scriptPath, '--model', 'tiny', '--vad-threshold', '0.3'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Esperar primer mensaje JSON de status
      const firstLine = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);
        localAudioProc.stdout.once('data', (data) => {
          clearTimeout(timeout);
          resolve(data.toString().trim());
        });
        localAudioProc.once('error', () => { clearTimeout(timeout); resolve(null); });
      });

      if (firstLine) {
        try {
          const status = JSON.parse(firstLine);
          if (status.status === 'iniciando' || status.status === 'escuchando') {
            started = true;
            console.log(`[AUDIO LOCAL] ${py} iniciado. VAD:${status.vad} Whisper:${status.whisper}`);

            // Leer stdout en busca de transcripciones
            localAudioProc.stdout.on('data', (data) => {
              const lines = data.toString().split('\n').filter(l => l.trim());
              lines.forEach(line => {
                try {
                  const msg = JSON.parse(line);
                  if (msg.text) {
                    localAudioWin?.webContents.send('local-transcript', msg);
                  } else if (msg.error) {
                    localAudioWin?.webContents.send('local-audio-error', msg);
                  }
                } catch {}
              });
            });

            localAudioProc.stderr.on('data', (data) => {
              console.error(`[AUDIO LOCAL ERR] ${data.toString().trim()}`);
            });

            localAudioProc.on('exit', (code) => {
              console.log(`[AUDIO LOCAL] Proceso terminado (código: ${code})`);
              localAudioProc = null;
              localAudioWin?.webContents.send('local-audio-error', { error: `Proceso terminado (código: ${code})` });
            });

            break;
          }
        } catch {}
      }

      // Si llegamos aquí, falló — limpiar
      try { localAudioProc.kill(); } catch {}
      localAudioProc = null;
    } catch (e) {
      console.warn(`[AUDIO LOCAL] Fallo con ${py}: ${e.message}`);
    }
  }

  if (!started) {
    return { success: false, error: 'No se pudo iniciar Python. ¿Está instalado? Verifica: pip install faster-whisper silero-vad sounddevice numpy torch' };
  }

  return { success: true };
});

ipcMain.handle('stop-local-audio', async () => {
  if (localAudioProc && localAudioProc.exitCode === null) {
    try { localAudioProc.stdin.write('\n'); } catch {}
    setTimeout(() => {
      try { localAudioProc.kill(); } catch {}
      localAudioProc = null;
    }, 1000);
  }
  return { success: true };
});

ipcMain.handle('local-tts', async (event, text) => {
  if (!text || !text.trim()) return { success: false, error: 'Texto vacío' };

  const _broadcastTtsState = (speaking) => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('tts-state', { speaking });
    });
  };

  // Si tenemos proceso TTS persistente, usarlo (cero latencia de startup)
  if (_ttsProc && _ttsProc.exitCode === null) {
    const safe = text.replace(/\n/g, ' ').trim();
    _broadcastTtsState(true);
    _ttsProc.stdin.write(`${safe}\n`);
    return { success: true, method: 'streaming-sapi' };
  }

  // Opción 1: Edge-TTS (mejor calidad)
  const ttsScript = path.join(__dirname, 'engine', 'tts_edge.py');
  const outputFile = path.join(app.getPath('temp'), `jarvis_tts_${Date.now()}.wav`);

  if (fs.existsSync(ttsScript)) {
    try {
      const result = await new Promise((resolve) => {
        const localVenvPy = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
        const localEnvPy = path.join(__dirname, 'env', 'Scripts', 'python.exe');
        let pyExec = 'python';
        if (fs.existsSync(localVenvPy)) pyExec = localVenvPy;
        else if (fs.existsSync(localEnvPy)) pyExec = localEnvPy;

        const proc = spawn(pyExec, [ttsScript, text, '--voice', 'es-MX-JorgeNeural', '--rate', '+10%', '--output', outputFile], {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000
        });
        _trackChildProcess(proc);
        let out = '';
        proc.stdout.on('data', d => out += d.toString());
        proc.on('close', (code) => {
          resolve({ code, output: out.trim() });
        });
        proc.on('error', (e) => resolve({ code: -1, output: e.message }));
      });

      if (result.code === 0 && fs.existsSync(outputFile)) {
        // Reproducir el archivo WAV de forma nativa — PlaySync bloquea hasta terminar
        const playCmd = `$player = New-Object System.Media.SoundPlayer; $player.SoundLocation = '${outputFile.replace(/'/g, "''")}'; $player.PlaySync();`;
        _broadcastTtsState(true);
        const playChild = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', playCmd], { windowsHide: true }, () => {
          _broadcastTtsState(false);
          try { fs.unlinkSync(outputFile); } catch(e) {}
        });
        _trackChildProcess(playChild);

        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
          win.webContents.send('local-tts-complete', { file: outputFile });
        }
        return { success: true, file: outputFile };
      }
    } catch (e) {
      console.warn(`[TTS] Edge-TTS falló: ${e.message}`);
    }
  }
  return { success: true, method: 'none' };
});

// ─── TTS Streaming persistente (SAPI, cero latencia) ──────
let _ttsProc = null;

function _ensureTtsProc() {
  if (_ttsProc && _ttsProc.exitCode === null) return;
  const psCode = `
    Add-Type -AssemblyName System.Speech;
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $synth.Rate = 1;
    try { $synth.SelectVoice('Microsoft Sabina Desktop'); } catch {}
    Write-Output '___TTS_READY___';
    while ($true) {
      $line = [Console]::In.ReadLine();
      if ($line -eq '___EXIT___') { break; }
      $synth.Speak($line);
      Write-Output '___TTS_DONE___';
    }
  `;
  _ttsProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCode], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  _ttsProc.stderr.on('data', d => { /* ignore */ });
  _ttsProc.on('exit', () => { _ttsProc = null; });

  // Watchdog inteligente de 45 segundos para el inicio de SAPI
  let ready = false;
  const ttsReadyTimer = setTimeout(() => {
    if (!ready && _ttsProc && _ttsProc.exitCode === null) {
      console.warn('[MAIN] TTS proc load timed out, killing');
      try { _ttsProc.kill(); } catch(e) {}
      _ttsProc = null;
    }
  }, 45000);

  _ttsProc.stdout.on('data', (d) => {
    const out = d.toString();
    if (out.includes('___TTS_READY___')) {
      ready = true;
      clearTimeout(ttsReadyTimer);
    }
    if (out.includes('___TTS_DONE___')) {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('tts-state', { speaking: false });
      });
    }
  });
}

// Iniciar TTS persistente al arrancar
_ensureTtsProc();

// Obtener el directorio home del usuario (para corregir rutas generadas por Gemini)
ipcMain.handle('get-home-dir', async () => {
  return app.getPath('home');
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion ? app.getVersion() : (require('./package.json').version || '1.0.0');
});

// Verificar si hay API key configurada (sin crear WebSocket)
ipcMain.handle('check-api-key', async () => {
  const key = process.env.GEMINI_API_KEY;
  return { configured: !!(key && key.trim().length >= 10) };
});

// Setup Gemini API key desde el wizard (renderer → main process seguro)
ipcMain.handle('setup-gemini-key', async (event, key) => {
  if (!key || typeof key !== 'string' || key.trim().length < 10) {
    return { success: false, error: 'Key inválida' };
  }
  process.env.GEMINI_API_KEY = key.trim();
  
  // Persistir en almacenamiento seguro de forma encriptada
  try {
    const creds = loadCredentials();
    creds.GEMINI_API_KEY = key.trim();
    saveCredentials(creds);
  } catch (e) {
    console.error(`[MAIN] No se pudo guardar la key en almacenamiento seguro: ${e.message}`);
  }

  // También persiste en .env para compatibilidad / desarrollo local
  try {
    const envPath = require('path').join(__dirname, '.env');
    require('fs').writeFileSync(envPath, `GEMINI_API_KEY=${key.trim()}\n`);
  } catch (e) {
    console.error(`[MAIN] No se pudo guardar .env: ${e.message}`);
  }
  return { success: true };
});

// Limpiar localStorage del renderer (nuevo usuario / reset de prueba)
ipcMain.handle('clear-storage', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false };
  try {
    await win.webContents.executeJavaScript(`
      localStorage.clear();
      sessionStorage.clear();
      true;
    `);
    // También limpiar la API key del proceso
    delete process.env.GEMINI_API_KEY;

    // Limpiar de almacenamiento seguro
    try {
      const creds = loadCredentials();
      delete creds.GEMINI_API_KEY;
      saveCredentials(creds);
    } catch (e) {}

    try {
      const envPath = require('path').join(__dirname, '.env');
      require('fs').writeFileSync(envPath, 'GEMINI_API_KEY=\n');
    } catch(e) {}
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// WebSocket Gemini — conexión segura, API key nunca sale del main process
ipcMain.handle('ws-connect', async (event) => {
  if (geminiWs) {
    if (geminiWs) { try { geminiWs.close(); } catch(e) {} geminiWs = null; }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, error: 'API_KEY_NOT_CONFIGURED' };
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, error: 'NO_WINDOW' };

  try {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    geminiWs = new WebSocket(url);

    geminiWs.on('open', () => {
      console.log('[MAIN] Gemini WS connected');
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-status', { type: 'open', event: { type: 'open' } });
      }
    });

    geminiWs.on('message', (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-message', data.toString());
      }
    });

    geminiWs.on('unexpected-response', (req, res) => {
      const status = res.statusCode || 'unknown';
      const text = `Handshake fallido: HTTP ${status}`;
      console.error(`[MAIN] Gemini WS unexpected-response: ${text}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-status', { type: 'error', event: { type: 'error', message: text } });
      }
    });

    geminiWs.on('error', (err) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-status', { type: 'error', event: { type: 'error', message: err.message || '' } });
      }
    });

    geminiWs.on('close', (code, reason) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-status', {
          type: 'close',
          event: { code: code, reason: reason || '', wasClean: code === 1000, type: 'close' }
        });
      }
      geminiWs = null;
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ws-send', (event, data) => {
  if (geminiWs && geminiWs.readyState === 1) {
    try { geminiWs.send(data); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  }
  return { success: false, error: 'WS_NOT_OPEN' };
});

ipcMain.handle('ws-close', () => {
  if (geminiWs) {
    try { geminiWs.close(); } catch(e) {}
    geminiWs = null;
  }
  return { success: true };
});

ipcMain.handle('ws-get-state', () => {
  return { readyState: geminiWs ? geminiWs.readyState : 3 };
});

// ─── OAuth Local Server (Gmail redirect flow) ──────────────────────────────
let _oauthServer = null;

ipcMain.handle('start-oauth-server', async (event, port) => {
  return new Promise((resolve, reject) => {
    if (_oauthServer) {
      try { _oauthServer.close(); } catch(e) {}
      _oauthServer = null;
    }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (code) {
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#050810;color:#00bfff"><h2>✅ Gmail Conectado</h2><p>Puedes cerrar esta ventana y volver a JARVIS.</p></body></html>');
        setTimeout(() => { try { server.close(); _oauthServer = null; } catch(e) {} }, 1000);
        resolve(code);
      } else {
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#050810;color:#ff3b30"><h2>❌ Error de autorización</h2><p>${error || 'Acceso denegado'}</p></body></html>`);
        setTimeout(() => { try { server.close(); _oauthServer = null; } catch(e) {} }, 1000);
        reject(new Error(error || 'Autorización denegada por el usuario'));
      }
    });
    _oauthServer = server;
    server.on('error', (err) => reject(err));
    server.listen(port, '127.0.0.1', () => {
      console.log(`[OAUTH] Servidor local escuchando en puerto ${port}`);
    });
    // Timeout de 3 minutos
    setTimeout(() => {
      try { server.close(); _oauthServer = null; } catch(e) {}
      reject(new Error('Tiempo de espera agotado. Intenta de nuevo.'));
    }, 180000);
  });
});

// Update these URLs to point to your own GitHub repository
const UPDATE_CHECK_URL = 'https://YOUR_GITHUB_USERNAME.github.io/jarvis/version.json';
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/YOUR_GITHUB_USERNAME/jarvis/releases/latest';

ipcMain.handle('check-for-update', async () => {
  const currentVersion = require('./package.json').version;
  try {
    // Try GitHub Releases first
    const response = await fetch(GITHUB_RELEASES_URL, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = await response.json();
      const latestVersion = data.tag_name?.replace(/^v/i, '') || data.name;
      if (latestVersion && _compareVersions(latestVersion, currentVersion) > 0) {
        return { hasUpdate: true, latestVersion, downloadUrl: data.html_url, currentVersion };
      }
      return { hasUpdate: false, currentVersion };
    }
  } catch (e) {
    console.warn('[UPDATE] GitHub check failed:', e.message);
  }
  try {
    // Fallback: website version.json
    const resp = await fetch(UPDATE_CHECK_URL, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.version && _compareVersions(data.version, currentVersion) > 0) {
        return { hasUpdate: true, latestVersion: data.version, downloadUrl: data.downloadUrl || data.url, currentVersion };
      }
    }
  } catch (e) {
    console.warn('[UPDATE] Website check failed:', e.message);
  }
  return { hasUpdate: false, currentVersion };
});

function _compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// ─── Screenshot Capture (error reporting) ────────────────────────────────
ipcMain.handle('capture-screenshot', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window' };
    const image = await win.webContents.capturePage();
    const pngBuffer = image.toPNG();
    const screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    const filename = `error_${Date.now()}.png`;
    const filepath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filepath, pngBuffer);
    return { success: true, filepath, filename };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Feedback Email ────────────────────────────────────────────────
ipcMain.handle('send-feedback-email', async (event, { message, user, version, filepath }) => {
  try {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const parts = [];

    // Text fields
    const fields = { message, user, version, timestamp: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }

    // File attachment
    if (filepath && fs.existsSync(filepath)) {
      const fileBuf = fs.readFileSync(filepath);
      const fname = path.basename(filepath);
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="${fname}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
      parts.push(fileBuf);
      parts.push(Buffer.from('\r\n'));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const options = {
      hostname: 'formspree.io',
      port: 443,
      path: '/f/xeebvdvz',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let respBody = '';
        res.on('data', chunk => respBody += chunk);
        res.on('end', () => {
          const ok = res.statusCode < 400;
          console.log(`[FEEDBACK] Formspree ${ok ? 'OK' : 'FAIL'} (${res.statusCode}) ${ok ? '' : respBody.slice(0,200)}`);
          resolve({ success: ok });
        });
      });
      req.on('error', (e) => {
        console.log(`[FEEDBACK] Formspree error: ${e.message}`);
        resolve({ success: false, error: e.message });
      });
      req.write(body);
      req.end();
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
});


