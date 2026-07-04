const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('window-control', 'close'),
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  runPowerShell: (command) => ipcRenderer.invoke('run-powershell', command),
  runCmd: (command) => ipcRenderer.invoke('run-cmd', command),
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  memoryRead: () => ipcRenderer.invoke('memory-read'),
  memoryWrite: (data) => ipcRenderer.invoke('memory-write', data),
  logToTerminal: (type, message) => ipcRenderer.send('log-to-terminal', type, message),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  fetchUrl: (url, raw) => ipcRenderer.invoke('fetch-url', url, raw),
  getSystemTime: () => ipcRenderer.invoke('get-system-time'),
  wsConnect: () => ipcRenderer.invoke('ws-connect'),
  wsSend: (data) => ipcRenderer.invoke('ws-send', data),
  wsClose: () => ipcRenderer.invoke('ws-close'),
  wsGetState: () => ipcRenderer.invoke('ws-get-state'),
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

  // ─── Local Audio Engine (Python VAD+Whisper) ─────────
  startLocalAudio: () => ipcRenderer.invoke('start-local-audio'),
  stopLocalAudio: () => ipcRenderer.invoke('stop-local-audio'),
  onLocalTranscript: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('local-transcript', handler);
    return () => ipcRenderer.removeListener('local-transcript', handler);
  },
  checkApiKey: () => ipcRenderer.invoke('check-api-key'),
  setupGeminiKey: (key) => ipcRenderer.invoke('setup-gemini-key', key),
  speakLocal: (text) => ipcRenderer.invoke('local-tts', text),
  onLocalTTSComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('local-tts-complete', handler);
    return () => ipcRenderer.removeListener('local-tts-complete', handler);
  },
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onTtsState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tts-state', handler);
    return () => ipcRenderer.removeListener('tts-state', handler);
  },
  onLocalAudioError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('local-audio-error', handler);
    return () => ipcRenderer.removeListener('local-audio-error', handler);
  },

  // ─── OAuth local server (Gmail redirect flow) ────────
  startOAuthServer: (port) => ipcRenderer.invoke('start-oauth-server', port),

  // ─── Safe File Operations (path-validated, no raw PS) ────────────────
  fileRead: (filePath) => ipcRenderer.invoke('file-read', filePath),
  fileWrite: (filePath, content) => ipcRenderer.invoke('file-write', filePath, content),
  fileDelete: (filePath) => ipcRenderer.invoke('file-delete', filePath),
  fileList: (dirPath, pattern) => ipcRenderer.invoke('file-list', dirPath, pattern),
  fileInfo: (filePath) => ipcRenderer.invoke('file-info', filePath),
  fileFind: (dirPath, pattern, maxResults) => ipcRenderer.invoke('file-find', dirPath, pattern, maxResults),
  setWallpaper: (type, value) => ipcRenderer.invoke('set-wallpaper', type, value),

  // ─── Secure Credential Storage (encrypted, never in localStorage) ────
  secureCredentialGet: (key) => ipcRenderer.invoke('secure-credential-get', key),
  secureCredentialSet: (key, value) => ipcRenderer.invoke('secure-credential-set', key, value),
  secureCredentialDelete: (key) => ipcRenderer.invoke('secure-credential-delete', key),
  secureCredentialList: () => ipcRenderer.invoke('secure-credential-list'),

  // ─── Auto-Update ──────────────────────────────────────────
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),

  // ─── Feedback Email ───────────────────────────────────────
  sendFeedbackEmail: (data) => ipcRenderer.invoke('send-feedback-email', data),

  // ─── Screenshot Capture (error reporting) ─────────────────
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),

  // ─── Developer / Reset ────────────────────────────────────
  clearStorage: () => ipcRenderer.invoke('clear-storage')
});
