const { autoUpdater } = require('electron-updater');
const { ipcMain, BrowserWindow } = require('electron');

function _log(level, msg) {
  const prefix = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[36m';
  console.log(`${prefix}[UPDATER] ${msg}\x1b[0m`);
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let _updateCheckInProgress = false;
let _updateInfo = null;
let _downloadProgress = 0;

function setupUpdater(getMainWindow) {
  autoUpdater.on('checking-for-update', () => {
    _log('info', 'Verificando actualizaciones...');
  });

  autoUpdater.on('update-available', (info) => {
    _log('info', `Actualización disponible: v${info.version}`);
    _updateInfo = info;
    _updateCheckInProgress = false;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    _log('info', 'No hay actualizaciones disponibles');
    _updateCheckInProgress = false;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-not-available', { version: info?.version });
    }
  });

  autoUpdater.on('error', (err) => {
    _log('error', `Error de actualización: ${err.message}`);
    _updateCheckInProgress = false;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-error', { message: err.message });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    _downloadProgress = progress.percent;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    _log('info', `Actualización v${info.version} descargada — lista para instalar`);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes
      });
    }
  });

  ipcMain.handle('check-for-updates', async () => {
    if (_updateCheckInProgress) return { checking: true };
    _updateCheckInProgress = true;
    try {
      await autoUpdater.checkForUpdates();
      return { checking: true };
    } catch (e) {
      _updateCheckInProgress = false;
      return { error: e.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { downloading: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('install-update', async () => {
    try {
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
      return { installing: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-update-status', () => {
    return {
      updateAvailable: !!_updateInfo,
      updateInfo: _updateInfo,
      downloadProgress: _downloadProgress,
      checking: _updateCheckInProgress
    };
  });

  _log('info', 'Sistema de actualizaciones inicializado');
}

function checkForUpdatesSilent() {
  if (_updateCheckInProgress) return;
  _updateCheckInProgress = true;
  autoUpdater.checkForUpdates().catch(() => {
    _updateCheckInProgress = false;
  });
}

module.exports = { setupUpdater, checkForUpdatesSilent };