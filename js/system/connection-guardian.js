import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';
import { connectWebSocket } from '../Core/Connection/manager.js';
import { ensureMicrophoneActive, restartMicrophone, isMicPipelineHealthySync } from '../audio/recorder.js';

const GUARD_INTERVAL_MS = 8000;
const WS_STALE_MS = 600000;
const MIC_RESTART_MAX = 3;
const MIC_RESTART_WINDOW_MS = 300000;

let _guardTimer = null;
let _wsRecovering = false;
let _wsFailCount = 0;
const WS_MAX_RETRIES = 10;
const WS_RETRY_COOLDOWN_MS = 300000;

let _micRestartCount = 0;
let _micRestartFirstTime = 0;

let _modeCache = null;
let _modeCacheTime = 0;
const MODE_CACHE_TTL = 10000;

const _errorLog = [];

import { createLogger } from '../utils/logger.js';
const _log = createLogger('GUARDIAN');

// Recuperación de estados de la UI/Audio stuck
function _guardStateRecovery() {
  const now = Date.now();
  const state = store.getState();
  
  if (state === STATE.SPEAKING && (store.get('activeSources') || []).length === 0) {
    _log('info', 'Watchdog: Speaking detectado sin fuentes de audio activas — recuperando a escucha/idle');
    store.setState(store.get('micActive') ? STATE.LISTENING : STATE.IDLE);
  }
  
  if (store.get('toolCount') > 0 && store.get('toolStartTime') && (now - store.get('toolStartTime')) > 35000) {
    _log('warn', 'Watchdog: Contador de ejecución de herramientas atascado (excedido 35s) — reiniciando contadores');
    store.set('toolCount', 0);
    store.set('toolStartTime', null);
    store.set('isExecutingTool', false);
    store.setState(store.get('micActive') ? STATE.LISTENING : STATE.IDLE);
  }
  
  if (store.get('toolCount') === 0 && state === STATE.WORKING) {
    _log('info', 'Watchdog: Estado de procesamiento activo (WORKING) sin herramientas corriendo — recuperando');
    store.setState(store.get('micActive') ? STATE.LISTENING : STATE.IDLE);
  }
  
  if (store.get('micActive') && state === STATE.IDLE && (store.get('activeSources') || []).length === 0) {
    store.setState(STATE.LISTENING);
  }
}

function _recordError(context, detail) {
  const entry = { time: new Date().toISOString(), context, detail };
  _errorLog.push(entry);
  if (_errorLog.length > 50) _errorLog.shift();
  _log('warn', `[${context}] ${detail}`);
}

async function _getMode() {
  const now = Date.now();
  if (_modeCache && (now - _modeCacheTime) < MODE_CACHE_TTL) return _modeCache;
  const mm = await import('./model-manager.js');
  _modeCache = mm.getMode();
  _modeCacheTime = now;
  return _modeCache;
}

export function invalidateModeCache() { _modeCache = null; }

async function _guardWebSocket() {
  const mode = await _getMode();
  if (mode === 'local') return;

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
    // Si el WS esta sano y conectado, no lo toques — Gemini maneja su propio timeout
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

async function _guardMicrophone() {
  if (!store.get('alwaysListen')) return;
  if (!store.get('focusMode')) return;

  const mode = await _getMode();
  const wsOk = window.ws?.readyState === 1;

  if (mode === 'local' && !wsOk) {
    if (!store.get('micActive')) { await ensureMicrophoneActive(true); return; }
    if (!isMicPipelineHealthySync()) await restartMicrophone(true);
    return;
  }

  if (!wsOk) return;

  if (!store.get('micActive')) {
    _recordError('mic_inactive', 'Micrófono inactivo — reactivando');
    await ensureMicrophoneActive(true);
    return;
  }

  if (!isMicPipelineHealthySync()) {
    _log('warn', 'Guardian: pipeline de micrófono insalubre — reiniciando');
    _recordError('mic_unhealthy', 'Pipeline de audio dañado — reinicio forzado');
    await restartMicrophone(true);
    return;
  }

  const now = Date.now();
  const lastTx = store.get('lastTranscriptionTime') || 0;
  const lastSpeech = store.get('lastSpeechDetectedTime') || 0;
  const machineState = store.get('machine');

  if (machineState === STATE.SPEAKING || machineState === STATE.WORKING) return;

  const userSpokeRecently = lastSpeech > 0 && (now - lastSpeech) < 30000;
  const transcriptionStale = lastTx > 0 && (now - lastTx) > 90000;
  const noTranscriptionAfterSpeech = lastSpeech > 0 && lastTx > 0 && lastTx < lastSpeech && (now - lastSpeech) > 25000;

  if (_micRestartCount > 0 && (now - _micRestartFirstTime) > MIC_RESTART_WINDOW_MS) _micRestartCount = 0;
  if (_micRestartCount >= MIC_RESTART_MAX) return;
  if ((userSpokeRecently && transcriptionStale) || noTranscriptionAfterSpeech) {
    _log('warn', `Micrófono: habla detectada sin transcripción — reiniciando`);
    _recordError('mic_no_transcription', `Habla detectada hace ${(now - lastSpeech) / 1000}s sin transcripción (reinicio ${_micRestartCount + 1}/${MIC_RESTART_MAX})`);
    if (_micRestartCount === 0) _micRestartFirstTime = now;
    _micRestartCount++;
    store.set('lastTranscriptionTime', 0);
    store.set('lastSpeechDetectedTime', 0);
    await restartMicrophone(true);
  }
}

function _resumeAudioContexts() {
  try {
    const a = document.querySelector('audio');
    if (a?.context?.state === 'suspended') a.context.resume();
  } catch (e) {
    _log('warn', `Resume playback ctx: ${e.message}`);
  }
}

export function initConnectionGuardian() {
  if (_guardTimer) return;

  store.set('alwaysListen', true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _resumeAudioContexts();
      _guardWebSocket();
      _guardMicrophone();
    }
  });

  window.addEventListener('focus', () => {
    _resumeAudioContexts();
    _guardMicrophone();
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
    await _guardWebSocket();
    await _guardMicrophone();
  }, GUARD_INTERVAL_MS);

  _log('info', `Guardian activo (intervalo ${GUARD_INTERVAL_MS}ms)`);
}

export function stopConnectionGuardian() {
  if (_guardTimer) {
    clearInterval(_guardTimer);
    _guardTimer = null;
  }
}

window.__guardianErrors = _errorLog;
