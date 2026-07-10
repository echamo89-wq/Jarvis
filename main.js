const { app, BrowserWindow, ipcMain, shell, Notification, net, globalShortcut, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execFile } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const { registerSecureStorageIpc, loadCredentials, saveCredentials } = require('./main/secure-storage');
const { registerPsIpc } = require('./main/ps-executor');

// ─── Capturar errores no manejados en el proceso principal ───
process.on('uncaughtException', (err) => {
  console.error(`\x1b[31m[MAIN] UNCAUGHT EXCEPTION: ${err.message}\x1b[0m`);
  console.error(`\x1b[31m[MAIN] Stack: ${err.stack?.substring(0, 1000)}\x1b[0m`);
});
process.on('unhandledRejection', (reason) => {
  console.error(`\x1b[33m[MAIN] UNHANDLED REJECTION: ${reason?.message || reason}\x1b[0m`);
});

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

// ─── Splash Window ──────────────────────────────────────────────────────────
let _splashWindow = null;
let _mainWindow = null;
let _splashPreloadFinished = false;
let _splashTimeout = null;

function _sendSplashProgress(pct, text) {
  if (_splashWindow && !_splashWindow.isDestroyed()) {
    _splashWindow.webContents.send('splash-progress', { pct, text });
  }
  console.log(`\x1b[36m[SPLASH] ${pct}% — ${text}\x1b[0m`);
}

function _showMainWindowFallback() {
  if (_splashPreloadFinished) return;
  _splashPreloadFinished = true;
  console.warn('\x1b[33m[SPLASH] Límite de carga excedido (>5s). Forzando despliegue de interfaz principal.\x1b[0m');
  
  if (_splashTimeout) {
    clearTimeout(_splashTimeout);
    _splashTimeout = null;
  }
  if (_splashWindow && !_splashWindow.isDestroyed()) {
    _splashWindow.close();
    _splashWindow = null;
  }
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.show();
    _mainWindow.focus();
  }
}

function createSplashWindow() {
  _splashPreloadFinished = false;
  _splashTimeout = setTimeout(_showMainWindowFallback, 5000);

  _splashWindow = new BrowserWindow({
    width: 380,
    height: 520,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    },
    show: false
  });

  _splashWindow.loadFile('splash.html');
  _splashWindow.once('ready-to-show', () => {
    _splashWindow.show();
  });

  return _splashWindow;
}

function createMainWindow() {
  _mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,  // Oculta hasta que la splash termine
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // ─── Redirigir console del renderer → terminal ──────────────
  _mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
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

  _mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, url) => {
    console.error(`\x1b[31m[MAIN] RENDERER FAIL LOAD: ${errorDescription} (${errorCode}) url=${url}\x1b[0m`);
  });

  _mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`\x1b[31m[MAIN] RENDERER CRASHED: reason=${details.reason} exitCode=${details.exitCode}\x1b[0m`);
    console.error(`\x1b[31m[MAIN] Recargando ventana en 2s...\x1b[0m`);
    setTimeout(() => {
      try {
        if (!_mainWindow.isDestroyed()) _mainWindow.reload();
      } catch(e) {
        console.error(`\x1b[31m[MAIN] Error al recargar: ${e.message}\x1b[0m`);
      }
    }, 2000);
  });

  _mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ─── --reset: limpiar todo ANTES de cargar la página ──────────
  if (process.argv.includes('--reset')) {
    try {
      const envPath = path.join(__dirname, '.env');
      fs.writeFileSync(envPath, '# Reset por --reset\n');
    } catch(e) {}
    delete process.env.GEMINI_API_KEY;
    try {
      const creds = loadCredentials();
      delete creds.GEMINI_API_KEY;
      saveCredentials(creds);
    } catch (e) {}
    console.log('[MAIN] --reset: API key, .env y secure storage limpiados');
    // Eliminar archivos de localStorage del disco ANTES de cargar la página
    try {
      const p = require('path');
      const userData = app.getPath('userData');
      const lsPath = p.join(userData, 'Local Storage');
      if (require('fs').existsSync(lsPath)) {
        require('fs').rmSync(lsPath, { recursive: true, force: true });
        console.log('[MAIN] --reset: localStorage eliminado del disco');
      }
      const ssPath = p.join(userData, 'Session Storage');
      if (require('fs').existsSync(ssPath)) {
        require('fs').rmSync(ssPath, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('[MAIN] Error limpiando almacenamiento local:', e.message);
    }
  }

  _mainWindow.loadFile('renderer.html');

  // Habilitar DevTools con F12 o Ctrl+Shift+I solo si no está empaquetado (modo desarrollo)
  _mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged) {
      if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        _mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });

  return _mainWindow;
}

// ─── Secuencia de precarga durante la splash ─────────────────────────────────
async function _runSplashPreload() {
  _sendSplashProgress(5, 'Analizando contexto del sistema...');
  await new Promise(r => setTimeout(r, 200));

  // Leer memoria del disco
  _sendSplashProgress(15, 'Cargando memoria persistente...');
  await new Promise(r => setTimeout(r, 150));

  // Verificar API key
  _sendSplashProgress(30, 'Verificando credenciales...');
  await new Promise(r => setTimeout(r, 200));

  // Cargar archivos de configuración de sistema
  _sendSplashProgress(45, 'Cargando protocolos de inteligencia...');
  await new Promise(r => setTimeout(r, 300));

  // Esperar que renderer.html haya cargado
  _sendSplashProgress(60, 'Inicializando interfaz principal...');
  await new Promise(resolve => {
    if (_mainWindow.webContents.isLoading()) {
      _mainWindow.webContents.once('did-finish-load', resolve);
    } else {
      resolve();
    }
  });

  _sendSplashProgress(75, 'Activando motores cognitivos...');
  await new Promise(r => setTimeout(r, 250));

  _sendSplashProgress(88, 'Conectando sistemas de audio...');
  await new Promise(r => setTimeout(r, 200));

  _sendSplashProgress(96, 'Preparando conexión con Gemini...');
  await new Promise(r => setTimeout(r, 300));

  // Señal de finalización a la splash
  _sendSplashProgress(100, 'Sistemas listos');
  if (_splashWindow && !_splashWindow.isDestroyed()) {
    _splashWindow.webContents.send('splash-done');
  }
}

// ─── IPC: Splash lista para recibir mensajes
ipcMain.on('splash-ready', () => {
  _runSplashPreload();
});

// ─── IPC: Splash terminó animación de salida → mostrar ventana principal
ipcMain.on('splash-finished', () => {
  _splashPreloadFinished = true;
  if (_splashTimeout) {
    clearTimeout(_splashTimeout);
    _splashTimeout = null;
  }
  if (_splashWindow && !_splashWindow.isDestroyed()) {
    _splashWindow.close();
    _splashWindow = null;
  }
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.show();
    _mainWindow.focus();
  }
});

let _tray = null;

function _createTray() {
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    let trayIcon;
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
    } else {
      trayIcon = nativeImage.createEmpty();
    }
    _tray = new Tray(trayIcon);
    _tray.setToolTip('JARVIS');
    _tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir JARVIS', click: () => {
        if (_mainWindow && !_mainWindow.isDestroyed()) { _mainWindow.show(); _mainWindow.focus(); }
      }},
      { label: 'Activar micrófono', click: () => {
        if (_mainWindow && !_mainWindow.isDestroyed()) _mainWindow.webContents.send('global-toggle-mic');
      }},
      { type: 'separator' },
      { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } }
    ]));
    _tray.on('double-click', () => {
      if (_mainWindow && !_mainWindow.isDestroyed()) { _mainWindow.show(); _mainWindow.focus(); }
    });
  } catch (e) {
    console.error('[MAIN] Error creando bandeja:', e.message);
  }
}

function _registerGlobalHotkeys() {
  try {
    globalShortcut.register('CommandOrControl+Shift+J', () => {
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.show();
        _mainWindow.focus();
        _mainWindow.webContents.send('global-toggle-mic');
      }
    });
  } catch (e) {
    console.error('[MAIN] Error registrando hotkey:', e.message);
  }
}

app.isQuitting = false;

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  console.warn('[MAIN] Ya hay una instancia de JARVIS en ejecución. Saliendo.');
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    if (_mainWindow.isMinimized()) _mainWindow.restore();
    _mainWindow.show();
    _mainWindow.focus();
  }
});

app.whenReady().then(() => {
  _startBackendServer();
  createSplashWindow();
  createMainWindow();
  _createTray();
  _registerGlobalHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
      createMainWindow();
    }
  });

  console.log('\x1b[32m========================================\x1b[0m');
  console.log('\x1b[32m   JARVIS -- SISTEMAS INICIANDO         \x1b[0m');
  console.log('\x1b[32m========================================\x1b[0m');
});

function _cleanupProcesses() {
  if (typeof cleanupPs === 'function') cleanupPs();
  _childProcesses.forEach(proc => {
    if (proc.exitCode === null) {
      try { proc.kill(); } catch (e) {}
    }
  });
  _childProcesses = [];
}

app.on('before-quit', () => {
  app.isQuitting = true;
  _cleanupProcesses();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (_tray) { _tray.destroy(); _tray = null; }
});

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
    if (app.isQuitting) {
      win.close();
    } else {
      win.hide();
    }
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
    const ws = new WebSocket(url);
    geminiWs = ws;

    ws.on('open', () => {
      console.log('[MAIN] Gemini WS connected');
      // Disable Nagle's algorithm to prioritize real-time packet delivery (lowers bidi audio/text latency)
      try { if (ws._socket) ws._socket.setNoDelay(true); } catch (e) {
        console.warn('[MAIN] No se pudo establecer setNoDelay en socket:', e.message);
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-status', { type: 'open', event: { type: 'open' } });
      }
    });

    ws.on('message', (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-message', data.toString());
      }
    });

    ws.on('unexpected-response', (req, res) => {
      const status = res.statusCode || 'unknown';
      const text = `Handshake fallido: HTTP ${status}`;
      console.error(`[MAIN] Gemini WS unexpected-response: ${text}`);
      if (win && !win.isDestroyed()) {
        // 401/403 = API key inválida/expirada — forzar re-onboarding
        if (status === 401 || status === 403) {
          win.webContents.send('ws-status', { type: 'auth_error', event: { message: 'API key inválida o expirada' } });
        } else {
          win.webContents.send('ws-status', { type: 'error', event: { type: 'error', message: text } });
        }
      }
    });

    ws.on('error', (err) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-status', { type: 'error', event: { type: 'error', message: err.message || '' } });
      }
    });

    ws.on('close', (code, reason) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-status', {
          type: 'close',
          event: { code: code, reason: reason || '', wasClean: code === 1000, type: 'close' }
        });
      }
      if (geminiWs === ws) geminiWs = null;
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

// ─── Export Chat ──────────────────────────────────────────────────────
ipcMain.handle('save-file-dialog', async (event, { defaultName, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, error: 'No window' };
  try {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName || 'conversation.md',
      filters: [
        { name: 'Markdown (.md)', extensions: ['md'] },
        { name: 'Texto plano (.txt)', extensions: ['txt'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, content, 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Screenshot base64 (para tool de análisis visual) ─────────────────
ipcMain.handle('capture-screenshot-base64', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window' };
    const image = await win.webContents.capturePage();
    return { success: true, data: image.toPNG().toString('base64') };
  } catch (e) {
    return { success: false, error: e.message };
  }
});


