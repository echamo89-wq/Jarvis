const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('window-control', 'close'),
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  runPowerShell: (command) => ipcRenderer.invoke('run-powershell', command),
  runCmd: (command) => ipcRenderer.invoke('run-cmd', command),
  getVolume: () => ipcRenderer.invoke('get-volume'),
  setVolume: (percent) => ipcRenderer.invoke('set-volume', percent),
  getBrightness: () => ipcRenderer.invoke('get-brightness'),
  setBrightness: (percent) => ipcRenderer.invoke('set-brightness', percent),
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  memoryRead: () => ipcRenderer.invoke('memory-read'),
  memoryWrite: (data) => ipcRenderer.invoke('memory-write', data),
  memoryVectorsRead: () => ipcRenderer.invoke('memory-vectors-read'),
  memoryVectorsWrite: (data) => ipcRenderer.invoke('memory-vectors-write', data),
  logToTerminal: (type, message) => ipcRenderer.send('log-to-terminal', type, message),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  fetchUrl: (url, raw) => ipcRenderer.invoke('fetch-url', url, raw),
  getSystemTime: () => ipcRenderer.invoke('get-system-time'),
  wsConnect: () => ipcRenderer.invoke('ws-connect'),
  wsSend: (data) => ipcRenderer.invoke('ws-send', data),
  wsClose: () => ipcRenderer.invoke('ws-close'),
  wsGetState: () => ipcRenderer.invoke('ws-get-state'),
  setMicState: (active) => ipcRenderer.invoke('set-mic-state', active),
  onWsMessage: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ws-message', handler);
    return () => ipcRenderer.removeListener('ws-message', handler);
  },
  onWsStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('ws-status', handler);
    return () => ipcRenderer.removeListener('ws-status', handler);
  },

  checkApiKey: () => ipcRenderer.invoke('check-api-key'),
  setupGeminiKey: (key) => ipcRenderer.invoke('setup-gemini-key', key),
  geminiTextChat: (opts) => ipcRenderer.invoke('gemini-text-chat', opts),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  startOAuthServer: (port) => ipcRenderer.invoke('start-oauth-server', port),
  onTtsState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tts-state', handler);
    return () => ipcRenderer.removeListener('tts-state', handler);
  },

  onTrayMicToggle: (callback) => {
    const handler = (_event, active) => callback(active);
    ipcRenderer.on('tray-mic-toggle', handler);
    return () => ipcRenderer.removeListener('tray-mic-toggle', handler);
  },

  // ─── Safe File Operations (path-validated, no raw PS) ────────────────
  fileRead: (filePath) => ipcRenderer.invoke('file-read', filePath),
  fileWrite: (filePath, content) => ipcRenderer.invoke('file-write', filePath, content),
  fileDelete: (filePath) => ipcRenderer.invoke('file-delete', filePath),
  fileList: (dirPath, pattern) => ipcRenderer.invoke('file-list', dirPath, pattern),
  fileInfo: (filePath) => ipcRenderer.invoke('file-info', filePath),
  fileFind: (dirPath, pattern, maxResults) => ipcRenderer.invoke('file-find', dirPath, pattern, maxResults),
  fileSummary: (dirPath) => ipcRenderer.invoke('file-summary', dirPath),
  fileMediaFind: (dirPath, mediaType, maxResults) => ipcRenderer.invoke('file-media-find', dirPath, mediaType, maxResults),
  setWallpaper: (type, value) => ipcRenderer.invoke('set-wallpaper', type, value),

  // ─── Secure Credential Storage (encrypted, never in localStorage) ────
  secureCredentialGet: (key) => ipcRenderer.invoke('secure-credential-get', key),
  secureCredentialSet: (key, value) => ipcRenderer.invoke('secure-credential-set', key, value),
  secureCredentialDelete: (key) => ipcRenderer.invoke('secure-credential-delete', key),
  secureCredentialList: () => ipcRenderer.invoke('secure-credential-list'),

  // ─── Feedback Email ───────────────────────────────────────
  sendFeedbackEmail: (data) => ipcRenderer.invoke('send-feedback-email', data),

  // ─── Screenshot Capture (error reporting) ─────────────────
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),

  // ─── Developer / Reset ────────────────────────────────────
  clearStorage: () => ipcRenderer.invoke('clear-storage'),
  remindersFileRead: () => ipcRenderer.invoke('reminders-file-read'),
  remindersFileWrite: (data) => ipcRenderer.invoke('reminders-file-write', data),
  findApp: (opts) => ipcRenderer.invoke('find-app', opts),
  launchUwp: (appId) => ipcRenderer.invoke('launch-uwp', appId),
  scanApps: () => ipcRenderer.invoke('scan-apps'),

  // ─── Export Chat ───────────────────────────────────────────
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),

  // ─── Screenshot base64 (para tool de análisis) ────────────
  captureScreenshotBase64: () => ipcRenderer.invoke('capture-screenshot-base64'),

  // ─── Full page analysis (hidden browser with JS rendering) ─
  analyzePage: (url) => ipcRenderer.invoke('analyze-page', url),

  // ─── Auto-Updater ───────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  onUpdateAvailable: (callback) => {
    const h = (_e, d) => callback(d);
    ipcRenderer.on('update-available', h);
    return () => ipcRenderer.removeListener('update-available', h);
  },
  onUpdateNotAvailable: (callback) => {
    const h = (_e, d) => callback(d);
    ipcRenderer.on('update-not-available', h);
    return () => ipcRenderer.removeListener('update-not-available', h);
  },
  onUpdateError: (callback) => {
    const h = (_e, d) => callback(d);
    ipcRenderer.on('update-error', h);
    return () => ipcRenderer.removeListener('update-error', h);
  },
  onUpdateDownloadProgress: (callback) => {
    const h = (_e, d) => callback(d);
    ipcRenderer.on('update-download-progress', h);
    return () => ipcRenderer.removeListener('update-download-progress', h);
  },
  onUpdateDownloaded: (callback) => {
    const h = (_e, d) => callback(d);
    ipcRenderer.on('update-downloaded', h);
    return () => ipcRenderer.removeListener('update-downloaded', h);
  },

  // ─── YouTube Download (yt-dlp nativo con progreso real) ───
  youtubeDownload: (args) => ipcRenderer.invoke('youtube-download', args),

  showConfirmDialog: (message) => ipcRenderer.invoke('show-confirm-dialog', message),
  onYoutubeProgress: (callback) => {
    const h = (_e, data) => callback(data);
    ipcRenderer.on('youtube-download-progress', h);
    return () => ipcRenderer.removeListener('youtube-download-progress', h);
  },

  // ─── Splash Window ───────────────────────────────────────────
  onSplashProgress: (callback) => {
    const h = (_e, data) => callback(data);
    ipcRenderer.on('splash-progress', h);
    return () => ipcRenderer.removeListener('splash-progress', h);
  },
  onSplashDone: (callback) => {
    const h = () => callback();
    ipcRenderer.on('splash-done', h);
    return () => ipcRenderer.removeListener('splash-done', h);
  },
  splashReady: () => ipcRenderer.send('splash-ready'),
  splashFinished: () => ipcRenderer.send('splash-finished'),
  getPlatform: () => (typeof process !== 'undefined' ? process.platform : 'win32'),
  getAppVersionSync: () => ipcRenderer.invoke('get-app-version')
});
