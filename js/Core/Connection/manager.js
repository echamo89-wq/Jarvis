import { store } from '../../state/store.js';
import { STATE, EVENTS } from '../../state/constants.js';
import { buildSystemInstruction } from '../../config/index.js';
import { getFunctionDeclarations } from '../../tools/registry.js';
import { showSystemErrorMessage } from '../../chat/messages.js';
import { updateDiagnostics } from '../../chat/diagnostics.js';
import { handleWsMessage } from './handler.js';
import { createLogger } from '../../utils/logger.js';
import { bus } from '../../utils/event-bus.js';
import { JARVIS_CONFIG } from '../../config/jarvis.config.js';

const _log = createLogger('WS');

let _generation = 0;
let _proxyCleanupFn = null;
let _ws = null;
let _cachedSystemInstruction = null;
let _cacheTime = 0;
const CACHE_TTL = JARVIS_CONFIG.ws.cacheTtlMs;
let reconnectTimer = null;
let reconnectBackoff = 500;
let _reconnectAttempts = 0;
const RECONNECT_MAX_BACKOFF = JARVIS_CONFIG.ws.reconnectMaxBackoffMs;
const RECONNECT_JITTER = JARVIS_CONFIG.ws.reconnectJitterMs;
const RECONNECT_MAX_ATTEMPTS = JARVIS_CONFIG.ws.reconnectMaxAttempts;


function _scheduleReconnect(closeCode) {
  if (reconnectTimer) return;
  _reconnectAttempts++;
  if (_reconnectAttempts > RECONNECT_MAX_ATTEMPTS) {
    _log('error', `Se alcanzó el límite de ${RECONNECT_MAX_ATTEMPTS} reintentos. Modo retry lento: cada 30s.`);
    store.set('_wsReconnectPending', true);
    store.set('_wsMaxRetriesExhausted', false);
    store.setState(STATE.ERROR);
    const bar = document.getElementById('conn-bar');
    if (bar) { const ct2 = bar.querySelector('.conn-bar-text'); if (ct2) ct2.innerText = 'Red inestable — reintentando cada 30s'; }
    const si = document.getElementById('chat-header-status');
    if (si) si.innerText = 'RECONECTANDO (LENTO)';
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (window.JarvisSupervisor) window.JarvisSupervisor.record('ws_reconnect_slow', { attempt: _reconnectAttempts });
      connectWebSocket();
    }, 30000);
    return;
  }
  store.set('_wsReconnectPending', true);
  if (closeCode === 1011 || closeCode === 1007) {
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

function _showConnectionBar(text) {
  const bar = document.getElementById('conn-bar');
  if (bar) {
    const ct = bar.querySelector('.conn-bar-text');
    if (ct) ct.innerText = text || 'Conexión perdida — reconectando...';
    bar.style.display = 'flex';
  }
  const si = document.getElementById('chat-header-status');
  if (si) si.innerText = 'RECONECTANDO...';
}

function _hideConnectionBar() {
  const bar = document.getElementById('conn-bar');
  if (bar) bar.style.display = 'none';
  const si = document.getElementById('chat-header-status');
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
  const myGen = _generation;
  const cleanupStatus = window.electronAPI.onWsStatus((status) => {
    if (myGen !== _generation) return; // Ignorar eventos stale de conexiones anteriores
    if (status.type === 'open') { wsProxy.readyState = 1; wsProxy.onopen?.(status.event); }
    else if (status.type === 'close') { wsProxy.readyState = 3; wsProxy.onclose?.(status.event); }
    else if (status.type === 'error') { wsProxy.readyState = 3; wsProxy.onerror?.(status.event); }
    else if (status.type === 'auth_error') {
      _log('error', `Auth error: ${status.event?.message || 'key inválida'}`);
      // Limpiar key y forzar onboarding
      localStorage.removeItem('jarvis_gemini_api_key');
      import('../../auth/index.js').then(m => {
        m.forceReauth();
      }).catch(e => {
        _log('error', `Error al forzar re-auth: ${e.message}`);
        location.reload();
      });
    }
  });
  _ws = wsProxy;
  try {
    Object.defineProperty(window, 'ws', { get: () => _ws, set: (v) => { _log('warn', 'Intento de reemplazar window.ws desde fuera — ignorado'); }, configurable: true, enumerable: true });
  } catch (e) { window.ws = wsProxy; }
  _proxyCleanupFn = () => {
    cleanupMsg(); cleanupStatus();
    wsProxy.send = () => {}; wsProxy.close = () => {};
  };
}

function _cleanupWsProxy() {
  if (_proxyCleanupFn) { _proxyCleanupFn(); _proxyCleanupFn = null; }
  _ws = null;
  try { delete window.ws; } catch (e) {}
}

export function getWs() { return _ws; }
export function sendWsMessage(msg) { if (_ws?.readyState === 1) { _ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } }

let _wsConnectTimeout = null;
let _wsMutex = false;

export async function connectWebSocket() {
  if (_wsMutex) { _log('warn', 'WS connect ya en progreso — ignorando llamada duplicada'); return; }
  _generation++;
  _wsMutex = true;
  const cleanup = () => { _wsMutex = false; };
  if (_wsConnectTimeout) clearTimeout(_wsConnectTimeout);
  _hideConnectionBar();
  store.set('_wsConnecting', true);
  store.set('_wsReconnectPending', false);
  store.set('_wsMaxRetriesExhausted', false);
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  _cleanupWsProxy();
  updateDiagnostics('WS', 'CONECTANDO...');

  // Verify API key via secure IPC (never stored in localStorage)
  let apiKey = null;
  try {
    if (window.electronAPI?.secureCredentialGet) {
      apiKey = await window.electronAPI.secureCredentialGet('GEMINI_API_KEY');
      if (apiKey) apiKey = apiKey.trim();
    }
  } catch (e) {}
  if (!apiKey) {
    apiKey = (typeof process !== 'undefined' && process.env) ? process.env.GEMINI_API_KEY : undefined;
  }
  if (!apiKey) {
    _log('warn', 'WS: no hay API key — abortando conexión');
    updateDiagnostics('WS', 'SIN KEY');
    store.set('_wsConnecting', false);
    store.setState(STATE.ERROR);
    showSystemErrorMessage('SISTEMAS INCOMPLETOS: GEMINI_API_KEY no configurada en el archivo .env.');
    const si2 = document.getElementById('chat-header-status');
    if (si2) { si2.innerText = 'ERROR DE CONFIGURACIÓN'; si2.classList.add('listening'); }
    cleanup();
    return;
  }

  _wsConnectTimeout = setTimeout(() => {
    if (store.get('_wsConnecting')) {
      _log('error', `WS connect timeout (${JARVIS_CONFIG.ws.connectTimeoutMs}ms) — forzando cierre`);
      window.electronAPI.wsClose();
      _scheduleReconnect();
    }
  }, JARVIS_CONFIG.ws.connectTimeoutMs);

  // Pre-build system instruction WHILE the TCP handshake happens — shaves 1-3s off first-response
  let _prewarmPromise = null;
  const now2 = Date.now();
  if (!_cachedSystemInstruction || (now2 - _cacheTime) > CACHE_TTL) {
    _prewarmPromise = (async () => {
      try {
        const userMemory = store.get('userMemory');
        let memoryContext = '';
        try {
          const { getMemoryContext } = await import('../../memory/memory-manager.js');
          const recentHistory = store.get('conversationHistory');
          const query = recentHistory?.slice(-3)?.map(m => m.content).join(' ') || userMemory?.userContext || 'información importante del usuario, horarios, materias, hechos';
          memoryContext = await getMemoryContext(query, 8);
        } catch {}
        const inst = await buildSystemInstruction(userMemory, memoryContext);
        _cachedSystemInstruction = inst;
        _cacheTime = Date.now();
        return inst;
      } catch (e) {
        _log('error', `Prewarm system instruction failed: ${e.message}`);
        return _cachedSystemInstruction || '';
      }
    })();
  }

  _setupWsProxy({
    onopen: async () => {
      cleanup();
      bus.emit(EVENTS.WS_CONNECTED);
      updateDiagnostics('WS', 'CONECTADO');
      _hideConnectionBar();
      store.set('_wsConnecting', false);
      store.set('_wsReconnectPending', false);
      _log('info', '=== WEBSOCKET CONECTADO ===');
      store.set('_reconnectCooldown', true);
      setTimeout(() => store.set('_reconnectCooldown', false), 800);
      if (window.JarvisSupervisor) window.JarvisSupervisor.record('ws_connect', {});
      document.getElementById('chat-header-status')?.classList.remove('listening');
      store.setState(STATE.IDLE);
      store.set('isReconnectingIntentional', false);
      _resetReconnectBackoff();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

      // Use pre-warmed instruction if available, otherwise await it
      let systemInstruction = _cachedSystemInstruction;
      if (_prewarmPromise) {
        try { systemInstruction = await _prewarmPromise; } catch {}
        _prewarmPromise = null;
      }
      if (!systemInstruction) {
        try {
          const userMemory = store.get('userMemory');
          systemInstruction = await buildSystemInstruction(userMemory, '');
          _cachedSystemInstruction = systemInstruction;
          _cacheTime = Date.now();
        } catch {}
      }
      const generationConfig = {
        responseModalities: ['AUDIO'],
        temperature: JARVIS_CONFIG.ai.temperature,
        topP: JARVIS_CONFIG.ai.topP,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: store.get('userVoice') || JARVIS_CONFIG.ai.defaultVoice } } }
      };
      const setupMsg = {
        setup: {
          model: JARVIS_CONFIG.ai.model,
          generationConfig,
          // Forzar español: mejora dramática en precisión de transcripción
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: JARVIS_CONFIG.vad,
            // Permitir interrupciones en cualquier momento
            activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          },
          contextWindowCompression: {
            triggerTokens: 25600,
            slidingWindow: { targetTokens: 12800 }
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
      // Invalidate system instruction cache so next reconnect gets fresh rules
      _cachedSystemInstruction = null;
      _log('warn', `=== WS CERRADO === código: ${event.code} | razón: ${event.reason || 'none'} | limpio: ${event.wasClean}`);
      if (window.JarvisSupervisor) window.JarvisSupervisor.record('ws_disconnect', { code: event.code, reason: event.reason });
      updateDiagnostics('WS', 'DESCONECTADO');
      const sessionVal = document.getElementById('diag-session');
      if (sessionVal) { sessionVal.innerText = 'INACTIVO'; sessionVal.style.color = 'rgba(255, 255, 255, 0.4)'; }
      _showConnectionBar('Conexión perdida — reconectando...');
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
    cleanup();
    _scheduleReconnect();
  });
}

export function cleanup() {
  if (_wsConnectTimeout) clearTimeout(_wsConnectTimeout);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (window.ws?.close) window.ws.close();
  _cleanupWsProxy();
}
