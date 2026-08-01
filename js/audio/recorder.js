import { store } from '../state/store.js';
import { bus } from '../utils/event-bus.js';
import { EVENTS, STATE } from '../state/constants.js';
import { createLogger } from '../utils/logger.js';

const _log = createLogger('REC');

let _stream = null;
let _audioCtx = null;
let _source = null;
let _workletNode = null;
let _isRecording = false;
let _lastPcmTime = 0;          // timestamp del último buffer PCM recibido
let _audioCtxWatchdog = null;  // intervalo de monitoreo del AudioContext
let _interruptStreak = 0;      // buffers consecutivos sobre el umbral (anti-eco del TTS)
let _chunksSent = 0;           // chunks PCM enviados al WS en la sesión actual

// ─── Watchdog de AudioContext ─────────────────────────────────────────────────
// Si el sistema operativo suspende el AudioContext (ej. bloqueo de pantalla, cambio
// de foco en Windows), lo reactivamos silenciosamente sin reiniciar el pipeline.
function _startAudioCtxWatchdog() {
  if (_audioCtxWatchdog) return;
  _audioCtxWatchdog = setInterval(async () => {
    if (!_isRecording || !_audioCtx) return;
    if (_audioCtx.state === 'suspended') {
      try {
        await _audioCtx.resume();
        _log('info', 'AudioContext reactivado (estaba suspendido por el SO)');
      } catch (e) {
        _log('warn', `No se pudo reactivar AudioContext: ${e.message}`);
      }
    }
    // Si llevamos más de 10s sin recibir PCM pero estamos grabando, algo falló
    if (_lastPcmTime > 0 && (Date.now() - _lastPcmTime) > 10000) {
      _log('warn', 'Pipeline de audio silencioso >10s — el track del micrófono puede haberse perdido');
    }
  }, 3000);
}

function _stopAudioCtxWatchdog() {
  if (_audioCtxWatchdog) {
    clearInterval(_audioCtxWatchdog);
    _audioCtxWatchdog = null;
  }
}

async function _sendPCM(pcmBuffer) {
  try {
    const pcmArray = new Int16Array(pcmBuffer);
    if (pcmArray.length === 0) return; // chunk vacío — nunca enviarlo al WS
    _lastPcmTime = Date.now();
    let sum = 0;
    for (let i = 0; i < pcmArray.length; i++) {
      sum += pcmArray[i] * pcmArray[i];
    }
    const rms = Math.sqrt(sum / pcmArray.length);
    store.set('lastMicEnergy', rms);

    // Interrupción local ultra-rápida si el usuario habla fuerte mientras Jarvis está reproduciendo voz
    const machineState = store.get('machine');
    const activeSources = store.get('activeSources') || [];
    const interruptEnabled = localStorage.getItem('jarvis_interrupt_mode') !== 'false';
    if (interruptEnabled) {
      const vadThreshold = parseInt(localStorage.getItem('jarvis_vad_threshold') || '300', 10);
      const interruptThreshold = Math.max(400, Math.round(1500 + (vadThreshold - 50) * 8.7));
      if (rms > interruptThreshold && (machineState === STATE.SPEAKING || activeSources.length > 0)) {
        _interruptStreak++;
        if (_interruptStreak >= 3) {
          _log('info', `[LOCAL INTERRUPT] Voz detectada (RMS: ${Math.round(rms)}, umbral: ${interruptThreshold}). Deteniendo reproducción.`);
          import('./playback.js').then(m => m.stopAudioPlayback());
          _interruptStreak = 0;
        }
      } else {
        _interruptStreak = 0;
      }
    }

    // Si interrupciones están desactivadas y Jarvis está hablando, no enviar audio al WS
    if (!interruptEnabled && (machineState === STATE.SPEAKING || activeSources.length > 0)) {
      return;
    }

    const bytes = new Uint8Array(pcmBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    _chunksSent++;
    const ws = window.ws;
    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm;rate=16000',
            data: base64
          }]
        }
      }));
    }
  } catch (err) {
    _log('error', `Error sending PCM: ${err.message}`);
  }
}

function _sendTurnComplete() {
  if (store.get('_serverCompletedTurn') || store.get('isExecutingTool') || store.get('waitingForResponse') || store.get('_turnState') === 'responding') {
    _log('info', 'Skipping redundant turnComplete message (Gemini is already processing or responding)');
    store.set('startTime', Date.now());
    store.set('waitingForResponse', true);
    return;
  }
  const ws = window.ws;
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify({
      clientContent: {
        turnComplete: true
      }
    }));
    store.set('startTime', Date.now());
    store.set('waitingForResponse', true);
  }
}

function _cleanup() {
  _stopAudioCtxWatchdog();
  _lastPcmTime = 0;
  _interruptStreak = 0;
  _chunksSent = 0;
  if (_workletNode) {
    try { _workletNode.disconnect(); } catch (e) {}
  }
  _workletNode = null;
  if (_source) {
    try { _source.disconnect(); } catch (e) {}
  }
  _source = null;
  if (_audioCtx && _audioCtx.state !== 'closed') {
    try { _audioCtx.close(); } catch (e) {}
  }
  _audioCtx = null;
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
}

export async function startRecording() {
  if (_isRecording) return false;
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        // Forzar sample rate de 16kHz nativamente desde el OS
        sampleRate: { ideal: 16000 },
        sampleSize: { ideal: 16 },
        // Latencia ultra-baja para captura en tiempo real
        latency: { ideal: 0 },
      }
    });

    _audioCtx = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });

    // Si el SO suspende el AudioContext al crearlo, lo reactivamos antes de continuar
    if (_audioCtx.state === 'suspended') {
      await _audioCtx.resume();
    }

    _source = _audioCtx.createMediaStreamSource(_stream);

    await _audioCtx.audioWorklet.addModule('js/audio/worklet-processor.js');

    _workletNode = new AudioWorkletNode(_audioCtx, 'pcm-processor');
    _workletNode.port.onmessage = (event) => {
      if (!_isRecording) return;
      _sendPCM(event.data);
    };
    _source.connect(_workletNode);

    // Detectar si el OS revoca el acceso al micrófono (ej. otra app toma exclusividad)
    _stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (_isRecording) {
          _log('warn', 'Track de micrófono terminado inesperadamente — el pipeline se detuvo');
          _isRecording = false;
          store.set('_isRecording', false);
          _stopAudioCtxWatchdog();
          bus.emit(EVENTS.MIC_STOPPED);
        }
      });
    });

    _isRecording = true;
    _lastPcmTime = Date.now();
    store.set('_isRecording', true);
    store.set('_serverCompletedTurn', false);
    _startAudioCtxWatchdog();
    bus.emit(EVENTS.MIC_STARTED);
    _log('info', 'Recording started');
    return true;
  } catch (err) {
    _log('error', `getUserMedia: ${err.message}`);
    _cleanup();
    return false;
  }
}

export function stopRecording() {
  if (!_isRecording) return;
  _isRecording = false;
  store.set('_isRecording', false);
  if (_chunksSent === 0) {
    // Sin audio enviado (ej. tap accidental del mic): no hay turno activo en el
    // servidor — enviar turnComplete provocaría el cierre 1007 "invalid argument".
    _log('warn', 'Grabación sin audio enviado — omitiendo turnComplete');
  } else {
    _sendTurnComplete();
  }
  _cleanup();
  _chunksSent = 0;
  bus.emit(EVENTS.MIC_STOPPED);
  _log('info', 'Recording stopped');
}

export function isRecording() { return _isRecording; }

export function cleanupRecorder() {
  _isRecording = false;
  store.set('_isRecording', false);
  _cleanup();
}
