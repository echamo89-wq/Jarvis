import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';
import { connectWebSocket } from '../Core/Connection/manager.js';
import { getAudioContext } from '../audio/playback.js';

const GUARD_INTERVAL_MS = 8000;
const WS_STALE_MS = 600000;
const WS_MAX_RETRIES = 10;
const WS_RETRY_COOLDOWN_MS = 300000;

let _guardTimer = null;
let _wsRecovering = false;
let _wsFailCount = 0;

const _errorLog = [];

import { createLogger } from '../utils/logger.js';
const _log = createLogger('GUARDIAN');

function _guardStateRecovery() {
  const now = Date.now();
  const state = store.getState();

  if (state === STATE.SPEAKING && (store.get('activeSources') || []).length === 0 && !store.get('_isProcessingImage')) {
    _log('info', 'Watchdog: Speaking detectado sin fuentes de audio activas — recuperando a idle');
    store.setState(STATE.IDLE);
  }

  if (store.get('toolCount') > 0 && store.get('toolStartTime') && (now - store.get('toolStartTime')) > 90000) {
    _log('warn', 'Watchdog: Contador de ejecución de herramientas atascado (excedido 35s) — reiniciando contadores');
    store.set('toolCount', 0);
    store.set('toolStartTime', null);
    store.set('isExecutingTool', false);
    store.setState(STATE.IDLE);
  }

  if (store.get('toolCount') === 0 && state === STATE.WORKING) {
    _log('info', 'Watchdog: Estado de procesamiento activo (WORKING) sin herramientas corriendo — recuperando');
    store.setState(STATE.IDLE);
  }
}

function _recordError(context, detail) {
  const entry = { time: new Date().toISOString(), context, detail };
  _errorLog.push(entry);
  if (_errorLog.length > 50) _errorLog.shift();
  _log('warn', `[${context}] ${detail}`);
}

function _sendKeepAlive() {
  const ws = window.ws;
  if (!ws || ws.readyState !== 1) return;
  const lastMsg = store.get('lastWsMessageTime') || 0;
  const idle = Date.now() - lastMsg;
  // If idle > 12s, send a lightweight nop to prevent server-side timeout
  // NOTA: no incluir `turns: []` — un array vacío puede ser rechazado por la
  // API Live ("invalid argument" → cierre 1007). turnComplete:false es un no-op válido.
  if (idle > 12000 && !store.get('_isRecording') && !store.get('isExecutingTool') && store.getState() !== STATE.SPEAKING) {
    try { ws.send(JSON.stringify({ clientContent: { turnComplete: false } })); } catch {}
  }
}

async function _guardWebSocket() {
  const apiKey = localStorage.getItem('jarvis_gemini_api_key');
  if (!apiKey) return;

  const readyState = window.ws?.readyState ?? 3;
  const connected = readyState === 1;

  if (connected) {
    if (_wsFailCount > 0) {
      _log('info', 'WebSocket recuperado');
      _recordError('ws_recovered', `Reconectado tras ${_wsFailCount} fallos`);
    }
    _wsFailCount = 0;
    _wsRecovering = false;
    return;
  }

  if (_wsRecovering || store.get('isReconnectingIntentional') || store.get('_wsConnecting') || store.get('_wsReconnectPending')) return;
  if (store.get('_wsMaxRetriesExhausted')) return;
  _wsFailCount++;
  if (_wsFailCount > WS_MAX_RETRIES) {
    _log('warn', `WebSocket desconectado — límite de ${WS_MAX_RETRIES} reintentos alcanzado. Esperando 5 min.`);
    _recordError('ws_max_retries', `Falló ${_wsFailCount} veces — en espera`);
    setTimeout(() => { _wsFailCount = 0; }, WS_RETRY_COOLDOWN_MS);
    return;
  }
  _wsRecovering = true;
  _log('warn', `WebSocket desconectado — reconectando (intento ${_wsFailCount}/${WS_MAX_RETRIES})...`);
  _recordError('ws_disconnect', `Intento ${_wsFailCount}/${WS_MAX_RETRIES}`);
  connectWebSocket();
  setTimeout(() => { _wsRecovering = false; }, 5000);
}

function _resumeAudioContexts() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const a = document.querySelector('audio');
    if (a?.context?.state === 'suspended') a.context.resume();
  } catch (e) {
    _log('warn', `Resume playback ctx: ${e.message}`);
  }
}

// Verifica la salud del pipeline de audio de entrada sin reiniciar innecesariamente
async function _guardMicPipeline() {
  // Solo actuar si el store indica que el micrófono debería estar activo
  const isRecording = store.get('_isRecording');
  if (!isRecording) return;

  // Verificar si el AudioContext del recorder está suspendido
  // El recorder exporta isRecording() como proxy de estado, no accedemos directamente al ctx
  // El watchdog interno en recorder.js se encarga de reactivar el AudioContext
  // Aquí solo registramos si la energía del micrófono lleva demasiado tiempo en 0
  const lastEnergy = store.get('lastMicEnergy') ?? -1;
  const lastEnergyTime = store.get('_lastMicEnergyTime') ?? 0;
  const now = Date.now();

  if (lastEnergy > 0) {
    store.set('_lastMicEnergyTime', now);
    return; // hay actividad, todo bien
  }

  // Si nunca hemos tenido energía, no reportar falso positivo
  if (lastEnergyTime === 0) {
    store.set('_lastMicEnergyTime', now);
    return;
  }

  // 15s sin ninguna energía de audio mientras se supone que graba → diagnosticar
  if ((now - lastEnergyTime) > 15000) {
    _log('warn', 'Pipeline de micrófono silencioso >15s — posible AudioContext suspendido');
    store.set('_lastMicEnergyTime', now); // reset para no spamear
  }
}

export function initConnectionGuardian() {
  if (_guardTimer) return;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _resumeAudioContexts();
      _guardWebSocket();
    }
  });

  window.addEventListener('focus', () => {
    _resumeAudioContexts();
  });

  window.addEventListener('error', (e) => {
    _recordError('uncaught_error', `${e.message} (${e.filename}:${e.lineno})`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    _recordError('unhandled_promise', e.reason?.message || e.reason || 'Unknown');
  });

  _guardTimer = setInterval(async () => {
    _resumeAudioContexts();
    _guardStateRecovery();
    _sendKeepAlive();
    await _guardWebSocket();
    await _guardMicPipeline();
  }, GUARD_INTERVAL_MS);

  _log('info', `Guardian activo (intervalo ${GUARD_INTERVAL_MS}ms)`);
}

export function stopConnectionGuardian() {
  if (_guardTimer) {
    clearInterval(_guardTimer);
    _guardTimer = null;
  }
}

export function invalidateModeCache() {
  // No-op: mode cache removed with mic guardian
}

window.__guardianErrors = _errorLog;