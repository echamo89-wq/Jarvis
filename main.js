const { app, BrowserWindow, ipcMain, shell, Notification, net, globalShortcut, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execFile } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { registerAllIpc } = require('./main/ipc/register-all');

const { registerSecureStorageIpc, loadCredentials, saveCredentials } = require('./main/secure-storage');
const { registerPsIpc } = require('./main/ps-executor');
const { registerAppFinder } = require('./main/app-finder');
const { registerYtdlIpc } = require('./main/ytdl-executor');
const { setupUpdater, checkForUpdatesSilent } = require('./main/updater');

// ─── Capturar errores no manejados en el proceso principal ───
process.on('uncaughtException', (err) => {
  console.error(`\x1b[31m[MAIN] UNCAUGHT EXCEPTION: ${err.message}\x1b[0m`);
  console.error(`\x1b[31m[MAIN] Stack: ${err.stack?.substring(0, 1000)}\x1b[0m`);
});
process.on('unhandledRejection', (reason) => {
  console.error(`\x1b[33m[MAIN] UNHANDLED REJECTION: ${reason?.message || reason}\x1b[0m`);
});

try {
  const dotenv = require('dotenv');
  dotenv.config();
} catch(e) {
  // Fallback: parse manual si dotenv no está disponible
  try {
    const env = fs.readFileSync('.env', 'utf8');
    env.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=#\s]+)=\s*(.*)$/);
      if (!match) return;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1].trim()] = value;
    });
  } catch(e) { /* no .env file */ }
}

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


function _trackChildProcess(proc) {
  if (proc && typeof proc.kill === 'function') {
    _childProcesses.push(proc);
    proc.once('exit', () => {
      _childProcesses = _childProcesses.filter(p => p !== proc);
    });
  }
  return proc;
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
  console.warn('\x1b[33m[SPLASH] Límite de carga excedido. Forzando despliegue de interfaz principal.\x1b[0m');
  
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
  _splashTimeout = setTimeout(_showMainWindowFallback, 30000);

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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
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
      sandbox: true  // FIX: sandbox activado — el preload sólo usa contextBridge/ipcRenderer
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
        const logPath = path.join(app.getPath('userData'), 'ui_logs.txt');
        fs.appendFileSync(logPath, `[${ts}] ${formatted}`);
      } catch(e) {}
    }
  });

  _mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, url) => {
    console.error(`\x1b[31m[MAIN] RENDERER FAIL LOAD: ${errorDescription} (${errorCode}) url=${url}\x1b[0m`);
  });

  _mainWindow.on('unresponsive', () => {
    console.warn(`\x1b[33m[MAIN] Ventana no responde — intentando recuperar...\x1b[0m`);
    setTimeout(() => {
      try {
        if (!_mainWindow.isDestroyed() && !_mainWindow.webContents.isLoading()) {
          _mainWindow.webContents.reload();
          console.log(`\x1b[32m[MAIN] Ventana recargada tras unresponsive\x1b[0m`);
        }
      } catch(e) {
        console.error(`\x1b[31m[MAIN] Error recuperando ventana: ${e.message}\x1b[0m`);
      }
    }, 3500);
  });

  _mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`\x1b[31m[MAIN] RENDERER CRASHED: reason=${details.reason} exitCode=${details.exitCode}\x1b[0m`);
    setTimeout(() => {
      try {
        if (!_mainWindow.isDestroyed()) {
          console.log(`\x1b[32m[MAIN] Recargando renderer...\x1b[0m`);
          _mainWindow.loadFile('renderer.html');
        }
      } catch(e) {
        console.error(`\x1b[31m[MAIN] Error al recargar renderer: ${e.message}\x1b[0m`);
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

  // DevTools: sólo en desarrollo (no en build empaquetado)
  if (!app.isPackaged) {
    _mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        _mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  return _mainWindow;
}

// ─── Secuencia de precarga durante la splash (progreso real) ─────────────
async function _runSplashPreload() {
  const startTime = Date.now();
  const MIN_SPLASH_MS = 1500;

  const steps = [
    { pct: 10, label: 'Inicializando sistemas...', task: async () => {
      await Promise.resolve();
    }},
    { pct: 25, label: 'Verificando credenciales...', task: async () => {
      try {
        const creds = loadCredentials();
        if (creds && creds.GEMINI_API_KEY) process.env.GEMINI_API_KEY = creds.GEMINI_API_KEY;
      } catch {}
    }},
    { pct: 55, label: 'Inicializando interfaz...', task: async () => {
      if (_mainWindow?.webContents?.isLoading()) {
        await new Promise(resolve => _mainWindow.webContents.once('did-finish-load', resolve));
      }
    }},
    { pct: 85, label: 'Estableciendo canales de comunicación...', task: async () => {
      await new Promise(r => setTimeout(r, 150));
    }},
    { pct: 95, label: 'Finalizando...', task: async () => {
      await new Promise(r => setTimeout(r, 100));
    }},
  ];

  for (const step of steps) {
    _sendSplashProgress(step.pct, step.label);
    await step.task();
  }

  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_SPLASH_MS) {
    await new Promise(r => setTimeout(r, MIN_SPLASH_MS - elapsed));
  }

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
let _micActive = false;

function _rebuildTrayMenu() {
  if (!_tray) return;
  _tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir JARVIS', click: () => {
      if (_mainWindow && !_mainWindow.isDestroyed()) { _mainWindow.show(); _mainWindow.focus(); }
    }},
    { type: 'separator' },
    {
      label: _micActive ? 'Micrófono: ACTIVADO' : 'Micrófono: DESACTIVADO',
      click: () => {
        _micActive = !_micActive;
        if (_mainWindow && !_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send('tray-mic-toggle', _micActive);
        }
        _rebuildTrayMenu();
      }
    },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

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
    _rebuildTrayMenu();
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
  createSplashWindow();
  createMainWindow();
  _createTray();
  _registerGlobalHotkeys();
  setupUpdater(() => _mainWindow);
  // Buscar actualización 10s después del boot (no bloquear inicio)
  setTimeout(() => checkForUpdatesSilent(), 10000);

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
registerAppFinder();
const { cleanupYtdl } = registerYtdlIpc((proc) => _trackChildProcess(proc));
registerAllIpc();

// (open-browser movido a main/ipc/handlers/network.js)

// (UI handlers movidas a main/ipc/handlers/ui.js)

// (open-path movido a main/ipc/handlers/network.js)

// (File Operations movidas a main/ipc/handlers/file-operations.js)

// ─── Wallpaper change via parameterized PS (no string interpolation) ──────
const WP_SCRIPT = `param([string]$Action, [string]$Value)
if ($Action -eq "color") {
  $parts = $Value.Split(" ");
  if ($parts.Count -ne 3) { Write-Output "ERR_INVALID_COLOR"; exit }
  foreach ($p in $parts) { if (-not ($p -match "^\\d+$")) { Write-Output "ERR_INVALID_COLOR"; exit } }
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }
'@;
  $p="HKCU:\\Control Panel\\Colors";
  New-ItemProperty -Path $p -Name Background -PropertyType String -Value "$($parts[0]) $($parts[1]) $($parts[2])" -Force;
  [W]::SystemParametersInfo(20,0,"$($parts[0]) $($parts[1]) $($parts[2])",2);
  Write-Output "OK"
} elseif ($Action -eq "url") {
  $img="$env:TEMP\\jarvis_wp_$(Get-Date -f yyyyMMdd_HHmmss).jpg";
  try {
    $wc=New-Object -ComObject MSXML2.ServerXMLHTTP;
    $wc.open("GET", $Value, $false);
    $wc.send();
    [IO.File]::WriteAllBytes($img, [Text.Encoding]::ASCII.GetBytes($wc.responseText));
    Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class W2 { [DllImport("user32.dll")] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }
'@;
    [W2]::SystemParametersInfo(20,0,$img,2);
    Write-Output "OK"
  } catch { Write-Output "ERR_DOWNLOAD_FAILED" }
} else { Write-Output "ERR_INVALID_TYPE" }`;

ipcMain.handle('set-wallpaper', async (event, type, value) => {
  try {
    if (type !== 'color' && type !== 'url') return { success: false, output: 'ERR_INVALID_TYPE' };
    const tmpFile = path.join(app.getPath('temp'), `jarvis_wp_${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, WP_SCRIPT, 'utf8');
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile, '-Action', type, '-Value', value],
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

// (file-find movido a main/ipc/handlers/file-operations.js)

// (Network handlers movidas a main/ipc/handlers/network.js)

// Helpers para volumen y brillo del sistema (ejecutados de forma segura en el proceso principal)
function getVolumeFromSystem() {
  const _run = () => new Promise((resolve) => {
    const script = `
      try {
        $code = '
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
          int RegisterControlChangeNotify(IntPtr p);
          int UnregisterControlChangeNotify(IntPtr p);
          int GetChannelCount(out uint c);
          int SetMasterVolumeLevelScalar(float l, ref Guid g);
          int GetMasterVolumeLevel(out float l);
          int GetMasterVolumeLevelScalar(out float l);
        }
        [Guid("7991E194-C085-40E5-882D-2450202D303D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator {
          int EnumAudioEndpoints(int f, int m, out IntPtr d);
          int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d);
        }
        [Guid("D66606E7-2774-40F5-857A-CE354C1474C5"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice {
          int Activate(ref Guid id, int cls, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
        }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
        class MMDeviceEnumeratorCom {}
        public class Audio {
          public static float Get() {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
            IMMDevice device = null;
            enumerator.GetDefaultAudioEndpoint(0, 0, out device);
            object o = null;
            var g = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
            device.Activate(ref g, 23, IntPtr.Zero, out o);
            float level = 0;
            ((IAudioEndpointVolume)o).GetMasterVolumeLevelScalar(out level);
            return level;
          }
        }';
        Add-Type -TypeDefinition $code -ErrorAction Stop
        [Audio]::Get()
      } catch {
        exit 1
      }
    `;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 5000 }, (error, stdout) => {
      if (error || !stdout) {
        resolve({ success: false, volume: null });
      } else {
        const val = parseFloat(stdout.trim().replace(',', '.'));
        if (isNaN(val)) resolve({ success: false, volume: null });
        else resolve({ success: true, volume: Math.round(val * 100) });
      }
    });
  });

  return (async () => {
    let r = await _run();
    if (r.success) return r;
    r = await _run();
    return r;
  })();
}

function setVolumeToSystem(percent) {
  return new Promise((resolve) => {
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    const scalar = (pct / 100).toFixed(2);

    // Method 1: C# COM interop via PowerShell
    const method1 = () => new Promise((res) => {
      const script = `
        try {
          $code = '
          using System;
          using System.Runtime.InteropServices;
          [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
          interface IAudioEndpointVolume {
            int RegisterControlChangeNotify(IntPtr p);
            int UnregisterControlChangeNotify(IntPtr p);
            int GetChannelCount(out uint c);
            int SetMasterVolumeLevelScalar(float l, ref Guid g);
            int GetMasterVolumeLevel(out float l);
            int GetMasterVolumeLevelScalar(out float l);
          }
          [Guid("7991E194-C085-40E5-882D-2450202D303D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
          interface IMMDeviceEnumerator {
            int EnumAudioEndpoints(int f, int m, out IntPtr d);
            int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d);
          }
          [Guid("D66606E7-2774-40F5-857A-CE354C1474C5"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
          interface IMMDevice {
            int Activate(ref Guid id, int cls, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
          }
          [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
          class MMDeviceEnumeratorCom {}
          public class Audio {
            public static void Set(float v) {
              var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
              IMMDevice device = null;
              enumerator.GetDefaultAudioEndpoint(0, 0, out device);
              object o = null;
              var g = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
              device.Activate(ref g, 23, IntPtr.Zero, out o);
              ((IAudioEndpointVolume)o).SetMasterVolumeLevelScalar(v, ref g);
            }
          }';
          Add-Type -TypeDefinition $code -ErrorAction Stop
          [Audio]::Set(${scalar})
          Write-Output "OK"
        } catch {
          Write-Error $_.Exception.Message
          exit 1
        }
      `;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 8000 }, (err, stdout, stderr) => {
        if (!err && stdout?.includes('OK')) return res({ success: true });
        res({ success: false, error: (stderr || err?.message || '').trim() });
      });
    });

    // Method 2: COM via WMP object (no C# compilation needed)
    const method2 = () => new Promise((res) => {
      const s2 = `
        try {
          $wmp = New-Object -ComObject "WMPlayer.OCX" -ErrorAction Stop
          $wmp.settings.volume = ${pct}
          $wmp = $null; [System.GC]::Collect()
          Write-Output "OK"
        } catch {
          Write-Error $_.Exception.Message
          exit 1
        }
      `;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', s2], { timeout: 5000 }, (err, stdout, stderr) => {
        if (!err && stdout?.includes('OK')) return res({ success: true });
        res({ success: false, error: (stderr || err?.message || '').trim() });
      });
    });

    // Method 3: nircmd (if available)
    const method3 = () => new Promise((res) => {
      const s3 = `
        $nircmd = Get-Command 'nircmd.exe' -ErrorAction SilentlyContinue;
        if (-not $nircmd) {
          $paths = @("$env:ProgramFiles\\nircmd.exe", "$env:ProgramFiles(x86)\\nircmd.exe", "$env:SystemRoot\\nircmd.exe", "$env:SystemRoot\\System32\\nircmd.exe");
          foreach ($p in $paths) { if (Test-Path $p) { $nircmd = $p; break } }
        }
        if ($nircmd) {
          $exe = if ($nircmd -is [string]) { $nircmd } else { $nircmd.Source };
          if (Test-Path $exe) {
            & $exe setsysvolume ${scalar};
            Write-Output "OK"
            exit 0
          }
        }
        Write-Output "NOCMD"
      `;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', s3], { timeout: 5000 }, (err, stdout) => {
        if (!err && stdout?.includes('OK')) return res({ success: true });
        res({ success: false, error: '' });
      });
    });

    // Method 4: SendKeys volume up/down to approximate the level
    const method4 = () => new Promise((res) => {
      // Read current volume first, then press keys to adjust
      const s4 = `
        try {
          $wsh = New-Object -ComObject "WScript.Shell" -ErrorAction Stop;
          $steps = [Math]::Floor(${pct} / 2);
          $steps = [Math]::Min($steps, 50);
          if ($steps -gt 0) {
            1..$steps | ForEach-Object { $wsh.SendKeys([char]0xAF); Start-Sleep -Milliseconds 20 };
          }
          Write-Output "OK"
        } catch { Write-Error "sendkeys fail"; exit 1 }
      `;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', s4], { timeout: 8000 }, (err, stdout) => {
        if (!err && stdout?.includes('OK')) return res({ success: true });
        res({ success: false, error: '' });
      });
    });

    (async () => {
      const r1 = await method1();
      if (r1.success) return resolve({ success: true, output: '' });

      const r2 = await method2();
      if (r2.success) return resolve({ success: true, output: '' });

      const r3 = await method3();
      if (r3.success) return resolve({ success: true, output: '' });

      const r4 = await method4();
      if (r4.success) return resolve({ success: true, output: '' });

      resolve({
        success: false,
        output: ''
      });
    })();
  });
}

function getBrightnessFromSystem() {
  const _run = (attempt) => new Promise((resolve) => {
    const script = `
      try {
        $val = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop).CurrentBrightness
        if ($val -eq $null) { throw "empty" }
        Write-Output $val
      } catch {
        Write-Error $_.Exception.Message
        exit 1
      }
    `;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error || !stdout) {
        resolve({ success: false, brightness: null });
      } else {
        const val = parseInt(stdout.trim());
        if (isNaN(val)) resolve({ success: false, brightness: null });
        else resolve({ success: true, brightness: val });
      }
    });
  });

  return (async () => {
    let r = await _run(1);
    if (r.success) return r;
    r = await _run(2);
    return r;
  })();
}

function setBrightnessToSystem(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  // Method 1: WmiMonitorBrightnessMethods (laptops + some monitors)
  const method1 = () => new Promise((resolve) => {
    const script = `
      try {
        $monitors = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop;
        if (-not $monitors) { throw "empty" }
        foreach ($m in $monitors) { $m.WmiSetBrightness(0, ${pct}) }
        Write-Output "OK"
      } catch { exit 1 }
    `;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 5000 }, (error, stdout) => {
      resolve({ success: !error && stdout?.includes('OK') });
    });
  });

  // Method 2: nircmd (if available on system) — método anterior eliminado por ser stub vacío
  const method2 = () => new Promise((resolve) => {
    const script = `
      $nircmd = Get-Command 'nircmd.exe' -ErrorAction SilentlyContinue;
      if (-not $nircmd) {
        $paths = @("$env:ProgramFiles\\nircmd.exe", "$env:ProgramFiles(x86)\\nircmd.exe", "$env:SystemRoot\\nircmd.exe", "$env:SystemRoot\\System32\\nircmd.exe");
        foreach ($p in $paths) { if (Test-Path $p) { $nircmd = $p; break } }
      }
      if ($nircmd) {
        $exe = if ($nircmd -is [string]) { $nircmd } else { $nircmd.Source };
        if (Test-Path $exe) {
          & $exe setbrightness ${pct};
          Write-Output "OK"
          exit 0
        }
      }
      Write-Output "NOCMD"
    `;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 5000 }, (err, stdout) => {
      resolve({ success: !err && stdout?.includes('OK') });
    });
  });

  // Method 3: nircmd (if available on system)
  const method3 = () => new Promise((resolve) => {
    const script = `
      $nircmd = Get-Command 'nircmd.exe' -ErrorAction SilentlyContinue;
      if (-not $nircmd) {
        $paths = @("$env:ProgramFiles\\nircmd.exe", "$env:ProgramFiles(x86)\\nircmd.exe", "$env:SystemRoot\\nircmd.exe", "$env:SystemRoot\\System32\\nircmd.exe");
        foreach ($p in $paths) { if (Test-Path $p) { $nircmd = $p; break } }
      }
      if ($nircmd) {
        $exe = if ($nircmd -is [string]) { $nircmd } else { $nircmd.Source };
        if (Test-Path $exe) {
          & $exe setbrightness ${pct};
          Write-Output "OK"
          exit 0
        }
      }
      Write-Output "NOCMD"
    `;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 5000 }, (err, stdout) => {
      resolve({ success: !err && stdout?.includes('OK') });
    });
  });

  return (async () => {
    let r = await method1();
    if (r.success) return r;
    r = await method1(); // retry method1 once
    if (r.success) return r;
    r = await method2(); // nircmd como fallback
    return r;
  })();
}

ipcMain.handle('get-volume', async () => {
  return await getVolumeFromSystem();
});

ipcMain.handle('set-volume', async (event, percent) => {
  return await setVolumeToSystem(percent);
});

ipcMain.handle('get-brightness', async () => {
  return await getBrightnessFromSystem();
});

ipcMain.handle('set-brightness', async (event, percent) => {
  return await setBrightnessToSystem(percent);
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

// Vector memory store (memoria episódica con embeddings)
const MEMORY_VECTORS_FILE = path.join(app.getPath('userData'), 'jarvis_memory_vectors.json');

ipcMain.handle('memory-vectors-read', () => {
  try {
    if (fs.existsSync(MEMORY_VECTORS_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_VECTORS_FILE, 'utf8'));
    }
  } catch(e) {}
  return { entries: [] };
});

ipcMain.handle('memory-vectors-write', (event, data) => {
  try {
    const tmpFile = MEMORY_VECTORS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, MEMORY_VECTORS_FILE);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Reminders file backup (persistencia a archivo, sobrevive a localStorage.clear())
const REMINDERS_FILE = path.join(app.getPath('userData'), 'jarvis_reminders.json');

ipcMain.handle('reminders-file-read', () => {
  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      return { success: true, data: JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')) };
    }
  } catch(e) {}
  return { success: false, data: [] };
});

ipcMain.handle('reminders-file-write', (event, data) => {
  try {
    const tmpFile = REMINDERS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, REMINDERS_FILE);
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

// ─── OAuth Local Server (Google / Spotify redirect flow) ───────────────────
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
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#050810;color:#00bfff"><h2>✅ Conexión Exitosa</h2><p>Puedes cerrar esta ventana y volver a JARVIS.</p></body></html>');
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

// Gemini Text Chat via REST API — para mensajes de texto (no audio Bidi)
ipcMain.handle('gemini-text-chat', async (event, { messages, systemInstruction }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, error: 'API_KEY_NOT_CONFIGURED' };
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { success: false, error: 'No messages provided' };
  }
  return new Promise((resolve) => {
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const body = { contents: messages };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    const bodyStr = JSON.stringify(body);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    };
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            resolve({ success: true, response: text });
          } else if (parsed?.promptFeedback?.blockReason) {
            resolve({ success: false, error: `Bloqueado: ${parsed.promptFeedback.blockReason}` });
          } else if (parsed?.error) {
            resolve({ success: false, error: parsed.error.message || 'API error' });
          } else {
            resolve({ success: false, error: 'Respuesta vacía del modelo' });
          }
        } catch (e) {
          resolve({ success: false, error: `Error parseando respuesta: ${e.message}` });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ success: false, error: `Error de conexión: ${e.message}` });
    });
    req.write(bodyStr);
    req.end();
  });
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

ipcMain.handle('set-mic-state', (event, active) => {
  _micActive = active;
  _rebuildTrayMenu();
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
    const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');
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

// ─── Confirm dialog para operaciones de alto riesgo ──────────────────
ipcMain.handle('show-confirm-dialog', async (event, message) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { response: false, remember: false };
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancelar', 'Permitir esta vez', 'Permitir siempre'],
    defaultId: 1,
    cancelId: 0,
    title: '🔒 JARVIS JS — Solicitud de permiso',
    message: message || '¿Permitir esta operación?',
    detail: `Jarvis quiere ejecutar una acción que requiere su autorización.\n\n¿Qué significa cada opción?\n• "Cancelar" — No permitir. Jarvis buscará otra forma de ayudar.\n• "Permitir esta vez" — Ejecutar solo ahora. Jarvis volverá a preguntar.\n• "Permitir siempre" — Confiar permanentemente. No volverá a preguntar para esta operación específica.`,
    noLink: true
  });
  return { response: result.response >= 1, remember: result.response === 2 };
});

// ─── Screenshot base64 (para tool de análisis visual) ─────────────────
ipcMain.handle('capture-screenshot-base64', async (event) => {
  try {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });
    if (!sources || sources.length === 0) {
      // Fallback: capturar solo la ventana actual
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { success: false, error: 'No window' };
      const image = await win.webContents.capturePage();
      const resized = image.resize({ width: 640 });
      return { success: true, data: resized.toJPEG(30).toString('base64') };
    }
    const image = sources[0].thumbnail;
    const resized = image.resize({ width: 640 });
    return { success: true, data: resized.toJPEG(30).toString('base64') };
  } catch (e) {
    // Fallback: capturar solo la ventana actual
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error('No window');
      const image = await win.webContents.capturePage();
      const resized = image.resize({ width: 640 });
      return { success: true, data: resized.toJPEG(30).toString('base64') };
    } catch (e2) {
      return { success: false, error: e.message };
    }
  }
});


