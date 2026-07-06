import { store } from '../../state/store.js';
import { STATE, EVENTS } from '../../state/constants.js';
import { buildSystemInstruction } from '../../config/index.js';
import { getFunctionDeclarations } from '../../tools/registry.js';
import { showSystemErrorMessage } from '../../chat/messages.js';
import { updateDiagnostics } from '../../chat/diagnostics.js';
import { handleWsMessage } from './handler.js';
import { createLogger } from '../../utils/logger.js';
import { bus } from '../../utils/event-bus.js';
const _log = createLogger('WS');

let _proxyCleanupFn = null;
let _cachedSystemInstruction = null;
let _cacheTime = 0;
const CACHE_TTL = 60000;
let reconnectTimer = null;
let reconnectBackoff = 500;
let _reconnectAttempts = 0;
const RECONNECT_MAX_BACKOFF = 15000;
const RECONNECT_JITTER = 500;
const RECONNECT_MAX_ATTEMPTS = 15;

function _scheduleReconnect(closeCode) {
  if (reconnectTimer) return;
  _reconnectAttempts++;
  if (_reconnectAttempts > RECONNECT_MAX_ATTEMPTS) {
    _log('error', `Se alcanzó el límite de ${RECONNECT_MAX_ATTEMPTS} reintentos. Deteniendo reconexión.`);
    const bar = document.getElementById('conn-bar');
    if (bar) { const ct2 = bar.querySelector('.conn-bar-text'); if (ct2) ct2.innerText = 'Error de conexión — recarga la página o presiona Reconectar'; }
    const si = document.getElementById('status-indicator');
    if (si) si.innerText = 'ERROR DE CONEXIÓN';
    store.setState(STATE.ERROR);
    store.set('_wsMaxRetriesExhausted', true);
    return;
  }
  store.set('_wsReconnectPending', true);
  if (closeCode === 1011) {
    reconnectBackoff = Math.max(reconnectBackoff, 3000);
    reconnectBackoff = Math.min(reconnectBackoff * 3, RECONNECT_MAX_BACKOFF);
  }
  const delay = reconnectBackoff + Math.floor(Math.random() * RECONNECT_JITTER);
  _log('info', `Reconexión ${_reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS} en ${delay}ms (backoff: ${reconnectBackoff}ms)`);
  _showConnectionBar(`Reconectando... (intento ${_reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (window.JarvisSupervisor) window.JarvisSupervisor.record('ws_reconnect', { backoff: reconnectBackoff, attempt: _reconnectAttempts });
    connectWebSocket();
    reconnectBackoff = Math.min(reconnectBackoff * 2, RECONNECT_MAX_BACKOFF);
  }, delay);
}

function _resetReconnectBackoff() { reconnectBackoff = 500; _reconnectAttempts = 0; store.set('_wsMaxRetriesExhausted', false); }

export async function ensureAlwaysListening() {
  if (!store.get('alwaysListen')) return;
  const { ensureMicrophoneActive } = await import('../../audio/recorder.js');
  await ensureMicrophoneActive(true);
}

function _showConnectionBar(text) {
  const bar = document.getElementById('conn-bar');
  if (bar) {
    const ct = bar.querySelector('.conn-bar-text');
    if (ct) ct.innerText = text || 'Conexión perdida — reconectando...';
    bar.style.display = 'flex';
  }
  const si = document.getElementById('status-indicator');
  if (si) si.innerText = 'RECONECTANDO...';
}

function _hideConnectionBar() {
  const bar = document.getElementById('conn-bar');
  if (bar) bar.style.display = 'none';
  const si = document.getElementById('status-indicator');
  if (si) si.innerText = 'SISTEMAS ONLINE';
}

function _setupWsProxy(handlers) {
  _cleanupWsProxy?.();
  const wsProxy = {
    readyState: 0,
    onopen: handlers.onopen || null,
    onclose: handlers.onclose || null,
    onerror: handlers.onerror || null,
    onmessage: handlers.onmessage || null,
    send(data) {
      if (window.JarvisSupervisor) window.JarvisSupervisor.recordWsMessage('send', data);
      window.electronAPI.wsSend(data);
    },
    close() { window.electronAPI.wsClose(); }
  };
  const cleanupMsg = window.electronAPI.onWsMessage((data) => {
    if (window.JarvisSupervisor) window.JarvisSupervisor.recordWsMessage('recv', data);
    if (wsProxy.onmessage) wsProxy.onmessage({ data });
  });
  const cleanupStatus = window.electronAPI.onWsStatus((status) => {
    if (status.type === 'open') { wsProxy.readyState = 1; wsProxy.onopen?.(status.event); }
    else if (status.type === 'close') { wsProxy.readyState = 3; wsProxy.onclose?.(status.event); }
    else if (status.type === 'error') { wsProxy.readyState = 3; wsProxy.onerror?.(status.event); }
  });
  window.ws = wsProxy;
  _proxyCleanupFn = () => {
    cleanupMsg(); cleanupStatus();
    wsProxy.send = () => {}; wsProxy.close = () => {};
  };
}

function _cleanupWsProxy() {
  if (_proxyCleanupFn) { _proxyCleanupFn(); _proxyCleanupFn = null; }
  delete window.ws;
}

let _wsConnectTimeout = null;
let _wsMutex = false;

export function connectWebSocket() {
  if (_wsMutex) { _log('warn', 'WS connect ya en progreso — ignorando llamada duplicada'); return; }
  _wsMutex = true;
  const cleanup = () => { _wsMutex = false; };
  const activeProvider = store.get('_activeProvider');
  if (activeProvider && activeProvider !== 'gemini') {
    _log('info', `Provider ${activeProvider} no requiere WebSocket — omitiendo`);
    store.set('_wsConnecting', false);
    store.setState(STATE.IDLE);
    cleanup(); return;
  }
  if (_wsConnectTimeout) clearTimeout(_wsConnectTimeout);
  _hideConnectionBar();
  store.set('_wsConnecting', true);
  store.set('_wsReconnectPending', false);
  store.set('_wsMaxRetriesExhausted', false);
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  _cleanupWsProxy();
  updateDiagnostics('WS', 'CONECTANDO...');

  // Verify API key before attempting connection
  const apiKey = localStorage.getItem('jarvis_gemini_api_key');
  if (!apiKey) {
    _log('warn', 'WS: no hay API key — abortando conexión');
    updateDiagnostics('WS', 'SIN KEY');
    store.set('_wsConnecting', false);
    store.setState(STATE.ERROR);
    showSystemErrorMessage('SISTEMAS INCOMPLETOS: GEMINI_API_KEY no configurada en el archivo .env.');
    const si2 = document.getElementById('status-indicator');
    if (si2) { si2.innerText = 'ERROR DE CONFIGURACIÓN'; si2.classList.add('listening'); }
    cleanup();
    return;
  }

  _wsConnectTimeout = setTimeout(() => {
    if (store.get('_wsConnecting')) {
      _log('error', 'WS connect timeout (10s) — forzando cierre');
      window.electronAPI.wsClose();
      _scheduleReconnect();
    }
  }, 10000);

  _setupWsProxy({
    onopen: async () => {
      cleanup();
      bus.emit(EVENTS.WS_CONNECTED);
      updateDiagnostics('WS', 'CONECTADO');
      _hideConnectionBar();
      store.set('_wsConnecting', false);
      store.set('_wsReconnectPending', false);
      store.set('lastTranscriptionTime', 0);
      _log('info', '=== WEBSOCKET CONECTADO ===');
      store.set('_reconnectCooldown', true);
      setTimeout(() => store.set('_reconnectCooldown', false), 800);
      if (window.JarvisSupervisor) window.JarvisSupervisor.record('ws_connect', {});
      document.getElementById('status-indicator')?.classList.remove('listening');
      store.setState(STATE.IDLE);
      store.set('isReconnectingIntentional', false);
      _resetReconnectBackoff();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

      const userMemory = store.get('userMemory');
      const now = Date.now();
      let systemInstruction = _cachedSystemInstruction;
      if (!systemInstruction || (now - _cacheTime) > CACHE_TTL) {
        systemInstruction = await buildSystemInstruction(userMemory);
        _cachedSystemInstruction = systemInstruction;
        _cacheTime = now;
      }
      const generationConfig = {
        responseModalities: ['AUDIO'],
        temperature: 0.6,
        topP: 0.9,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } }
      };
      const setupMsg = {
        setup: {
          model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
          generationConfig,
          inputAudioTranscription: {},
          realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: 200,
                silenceDurationMs: 400
              }
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
          tools: [
            { googleSearch: {} },
            { functionDeclarations: getFunctionDeclarations() }
          ]
        }
      };
      window.ws.send(JSON.stringify(setupMsg));
    },

    onmessage: async (event) => {
      handleWsMessage(event);
    },

    onerror: (err) => {
      cleanup();
      bus.emit(EVENTS.WS_ERROR || 'ws:error', err);
      _log('error', `=== ERROR WEBSOCKET: ${err.message || 'desconocido'} ===`);
      try {
        updateDiagnostics('WS', 'ERROR');
        store.setState(STATE.ERROR);
        _showConnectionBar('Conexión perdida — reconectando...');
        if (!store.get('isReconnectingIntentional')) _scheduleReconnect();
      } catch (e) {
        _log('error', `=== ERROR en onerror handler: ${e.message} ===`);
        _log('error', `Stack: ${e.stack}`);
      }
    },

    onclose: (event) => {
      cleanup();
      bus.emit(EVENTS.WS_DISCONNECTED);
      store.set('_wsConnecting', false);
      store.set('lastTranscriptionTime', 0);
      _log('warn', `=== WS CERRADO === código: ${event.code} | razón: ${event.reason || 'none'} | limpio: ${event.wasClean}`);
      if (window.JarvisSupervisor) window.JarvisSupervisor.record('ws_disconnect', { code: event.code, reason: event.reason });
      updateDiagnostics('WS', 'DESCONECTADO');
      const sessionVal = document.getElementById('diag-session');
      if (sessionVal) { sessionVal.innerText = 'INACTIVO'; sessionVal.style.color = 'rgba(255, 255, 255, 0.4)'; }
      _showConnectionBar('Conexión perdida — reconectando...');
      if (store.get('alwaysListen')) {
        store.set('micActive', false);
      }
      store.setState(STATE.ERROR);
      if (!store.get('isReconnectingIntentional')) {
        _scheduleReconnect(event.code);
      }
      if (store.get('isReconnectingIntentional')) {
        store.set('isReconnectingIntentional', false);
        _resetReconnectBackoff();
        setTimeout(connectWebSocket, 200);
      }
    }
  });

  window.electronAPI.wsConnect().then(result => {
    if (!result.success && result.error === 'API_KEY_NOT_CONFIGURED') {
      // Already handled above
    } else if (!result.success) {
      _log('error', `Error de conexión WS (main): ${result.error}`);
      _scheduleReconnect();
    }
  }).catch(e => {
    _log('error', `wsConnect promise error: ${e.message}`);
    _scheduleReconnect();
  });
}

export function cleanup() {
  if (_wsConnectTimeout) clearTimeout(_wsConnectTimeout);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (window.ws?.close) window.ws.close();
  _cleanupWsProxy();
}
