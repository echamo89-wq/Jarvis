import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';
import { bus } from '../utils/event-bus.js';
import { initAudio, getAudioContext, stopAudioPlayback } from './playback.js';
import { updateDiagnostics } from '../chat/diagnostics.js';
import { createLogger } from '../utils/logger.js';
const _log = createLogger('RECORDER');
let recordingCtx = null;
let micStream = null;
let scriptNode = null;
let micSource = null;
let _micStarting = false;
let _initAttempts = 0;
let _localAudioRestartTimer = null;
let _localAudioActive = false;
let _usingLocalPythonMic = false;
const MIC_RETRY_BASE_MS = 1000;
const MIC_RETRY_MAX_MS = 8000;
let _prewarmedWorklet = false;

// Pre-warm AudioContext y cargar worklet al boot
export async function prewarmAudio() {
  if (_prewarmedWorklet) return;
  try {
    initAudio();
    const ctx = getAudioContext();
    if (ctx && ctx.state !== 'closed') {
      await ctx.audioWorklet.addModule('worklet.js');
      _prewarmedWorklet = true;
      _log('info', 'Worklet pre-cargado en AudioContext existente');
      return;
    }
  } catch (e) {
    _log('warn', `Prewarm: ${e.message}`);
  }
  // Fallback: crear contexto temporal si el de playback no está listo
  try {
    const tmp = new AudioContext({ sampleRate: 48000 });
    await tmp.audioWorklet.addModule('worklet.js');
    tmp.close();
    _prewarmedWorklet = true;
  } catch (e2) {
    _log('warn', `Prewarm fallback: ${e2.message}`);
    _prewarmedWorklet = true;
  }
}

function _arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

function _micRetryDelay() {
  return Math.min(MIC_RETRY_BASE_MS * Math.pow(1.5, _initAttempts - 1), MIC_RETRY_MAX_MS);
}

function _attachTrackWatchdog(stream) {
  stream.getAudioTracks().forEach(track => {
    track.onended = () => {
      _log('warn', 'Track de micrófono finalizado — reiniciando');
      if (store.get('alwaysListen')) {
        setTimeout(() => restartMicrophone(true), 500);
      }
    };
    track.onmute = () => _log('warn', 'Track de micrófono silenciado por el sistema');
  });
}

export function isMicPipelineHealthySync() {
  if (!store.get('micActive')) return true;
  if (_usingLocalPythonMic) return _localAudioActive;
  if (!micStream || !scriptNode) return false;
  const tracks = micStream.getAudioTracks();
  if (!tracks.length || tracks[0].readyState !== 'live') return false;
  if (recordingCtx?.state === 'suspended') return false;
  const lastPacket = store.get('lastMicPacketTime') || 0;
  const wsOk = window.ws?.readyState === 1;
  if (wsOk && lastPacket > 0 && (Date.now() - lastPacket) > 30000) return false;
  return true;
}

async function _startRecording() {
  _initAttempts++;
  try {
    initAudio();
    // Siempre crear AudioContext fresco para evitar estado corrupto tras restart
    if (recordingCtx && recordingCtx.state !== 'closed') {
      try { recordingCtx.close(); } catch (e) {}
    }
    recordingCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    if (!recordingCtx._workletLoaded) {
      try {
        await recordingCtx.audioWorklet.addModule('worklet.js');
        recordingCtx._workletLoaded = true;
      } catch (e) {
        _log('warn', `AudioWorklet fallback a ScriptProcessor: ${e.message}`);
        recordingCtx._workletLoaded = false;
      }
    }

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 }
    });
    _attachTrackWatchdog(micStream);
    _localAudioActive = false;
    _usingLocalPythonMic = false;
  micSource = recordingCtx.createMediaStreamSource(micStream);
  let pcmPacketCount = 0;
  store.set('lastMicEnergy', 0);

  function _calculateEnergy(int16Buffer) {
    let sum = 0;
    for (let i = 0; i < int16Buffer.length; i++) sum += Math.abs(int16Buffer[i]);
    return sum / int16Buffer.length;
  }

  function _sendPCMChunk(int16Buffer) {
    const ws = window.ws;
    if (!ws || ws.readyState !== 1) return;
    if (store.get('_reconnectCooldown')) return;

    // Enviar PCM incluso durante playback para permitir interrupción por VAD
    // Solo bloqueamos 200ms tras el fin del playback para evitar eco residual
    const lastPlayEnd = store.get('_lastPlaybackEnded') || 0;
    if (lastPlayEnd > 0 && Date.now() - lastPlayEnd < 200) return;

    // Energy solo si el panel diagnóstico está visible (cacheado)
    const _diagPanel = document.getElementById('diag-panel');
    const diagVisible = _diagPanel?.style.display !== 'none';
    if (diagVisible) {
      const energy = _calculateEnergy(new Int16Array(int16Buffer));
      store.set('lastMicEnergy', energy);
      const threshold = store.get('speechEnergyThreshold') || 100;
      if (energy > threshold) {
        store.set('lastSpeechDetectedTime', Date.now());
      }
    }

    const base64 = _arrayBufferToBase64(int16Buffer);
    pcmPacketCount++;
    if (pcmPacketCount % 500 === 0) _log('info', `PCM: ${pcmPacketCount} paquetes`);
    store.set('lastMicPacketTime', Date.now());
    try {
      ws.send(JSON.stringify({
        realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64 }] }
      }));
    } catch (sendErr) {
      _log('error', `ws.send falló: ${sendErr.message}`);
    }
  }

  const _silentGain = recordingCtx.createGain();
  _silentGain.gain.value = 0;
  _silentGain.connect(recordingCtx.destination);

  if (recordingCtx._workletLoaded) {
    scriptNode = new AudioWorkletNode(recordingCtx, 'jarvis-mic-processor', {
      processorOptions: { inputSampleRate: recordingCtx.sampleRate }
    });
    scriptNode.port.onmessage = (event) => _sendPCMChunk(event.data.int16);
    micSource.connect(scriptNode);
    scriptNode.connect(_silentGain);
  } else {
    const inputSampleRate = recordingCtx.sampleRate;
    const targetSampleRate = 16000;
    const ratio = inputSampleRate / targetSampleRate;
    let _indexRemainder = 0;
    scriptNode = recordingCtx.createScriptProcessor(1024, 1, 1);
    scriptNode.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const out = new Float32Array(Math.ceil((inputData.length + _indexRemainder) / ratio));
      let oi = 0;
      let srcIdx = _indexRemainder;
      while (srcIdx < inputData.length) {
        const floor = Math.floor(srcIdx);
        const ceil = Math.min(floor + 1, inputData.length - 1);
        const t = srcIdx - floor;
        out[oi++] = inputData[floor] * (1 - t) + inputData[ceil] * t;
        srcIdx += ratio;
      }
      _indexRemainder = srcIdx - inputData.length;
      if (_indexRemainder < 0) _indexRemainder = 0;
      const used = oi;
      const gain = 2.5;
      const int16 = new Int16Array(used);
      for (let i = 0; i < used; i++) {
        const s = Math.max(-1, Math.min(1, out[i] * gain));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      _sendPCMChunk(int16.buffer);
    };
    micSource.connect(scriptNode);
    scriptNode.connect(_silentGain);
  }
  _initAttempts = 0;
  store.set('lastMicPacketTime', Date.now());
  return true;
  } catch (err) {
    _log('error', `Inicio de audio falló (intento ${_initAttempts}): ${err.message}`);
    import('../system/model-manager.js').then(mm => mm.setAudioRestartLog(true));
    _stopRecording();
    if (store.get('alwaysListen') || store.get('micActive')) {
      const delay = _micRetryDelay();
      _log('warn', `Reintentando micrófono en ${delay}ms...`);
      setTimeout(() => {
        _micStarting = false;
        if (store.get('alwaysListen') || store.get('micActive')) {
          _startRecording().catch(() => {});
        }
      }, delay);
    } else {
      _micStarting = false;
      store.set('micActive', false);
    }
    throw err;
  }
}

function _stopRecording() {
  _localAudioActive = false;
  _usingLocalPythonMic = false;
  if (scriptNode) {
    try { scriptNode.disconnect(); } catch (e) { _log('warn', `scriptNode disconnect: ${e.message}`); }
    if (scriptNode.port) scriptNode.port.close();
    scriptNode = null;
  }
  if (micSource) {
    try { micSource.disconnect(); } catch (e) { _log('warn', `micSource disconnect: ${e.message}`); }
    micSource = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  // Cerrar y limpiar el AudioContext para evitar acumulación de contextos corruptos
  if (recordingCtx && recordingCtx.state !== 'closed') {
    try { recordingCtx.close(); } catch (e) { _log('warn', `recordingCtx close: ${e.message}`); }
  }
  recordingCtx = null;
}

function _setMicBtnOn(isOn) {
  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;
  if (isOn) {
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.dataset.micOn = 'true';
  } else {
    micBtn.setAttribute('aria-pressed', 'false');
    micBtn.dataset.micOn = 'false';
  }
}

async function _activateLocalAudio(skipStopAudio) {
  if (!skipStopAudio) stopAudioPlayback();
  const result = await window.electronAPI.startLocalAudio();
  if (!result.success) {
    throw new Error(result.error || 'Error al iniciar audio local');
  }
  _localAudioActive = true;
  _usingLocalPythonMic = true;
  store.set('lastMicPacketTime', Date.now());
  _setMicBtnOn(true);
  store.setState(STATE.LISTENING);
  store.set('startTime', Date.now());
  _log('info', 'Audio LOCAL activado (Python VAD+Whisper)');
  if (window.JarvisSupervisor) window.JarvisSupervisor.record('mic', { active: true, mode: 'local' });
}

async function _activateCloudMic(skipStopAudio) {
  const ws = window.ws;
  if (!ws || ws.readyState !== 1) {
    throw new Error('WebSocket no conectado');
  }
  if (!skipStopAudio) stopAudioPlayback();
  await _startRecording();
  _setMicBtnOn(true);
  store.setState(STATE.LISTENING);
  store.set('startTime', Date.now());
  store.set('waitingForResponse', true);
  _log('info', 'Micrófono activado');
  if (window.JarvisSupervisor) window.JarvisSupervisor.record('mic', { active: true });
}

export async function ensureMicrophoneActive(skipStopAudio = true) {
  if (_micStarting) return;
  if (store.get('micActive') && isMicPipelineHealthySync()) return;

  const mm = await import('../system/model-manager.js');
  const mode = mm.getMode();
  const wsAvailable = window.ws?.readyState === 1;

  _micStarting = true;
  store.set('alwaysListen', true);

  try {
    if (mode === 'local' && !wsAvailable) {
      await _activateLocalAudio(skipStopAudio);
      store.set('micActive', true);
      updateDiagnostics('Micrófono', 'ACTIVO');
    } else if (wsAvailable) {
      if (store.get('micActive') && !isMicPipelineHealthySync()) _stopRecording();
      await _activateCloudMic(skipStopAudio);
      store.set('micActive', true);
      updateDiagnostics('Micrófono', 'ACTIVO');
    }
  } catch (err) {
    _log('error', `ensureMicrophoneActive: ${err.message}`);
  } finally {
    _micStarting = false;
  }
}

export async function restartMicrophone(skipStopAudio = true) {
  if (_micStarting) return;
  _log('warn', 'Reiniciando pipeline de micrófono...');

  const mm = await import('../system/model-manager.js');
  const mode = mm.getMode();
  const wsAvailable = window.ws?.readyState === 1;

  if (mode === 'local' && !wsAvailable) {
    try { await window.electronAPI.stopLocalAudio(); } catch (e) {}
    _localAudioActive = false;
  } else {
    _stopRecording();
  }

  await ensureMicrophoneActive(skipStopAudio);
}

export async function toggleMicrophone(skipStopAudio, userInitiated = true) {
  if (_micStarting) return;

  const mm = await import('../system/model-manager.js');
  const mode = mm.getMode();
  const ws = window.ws;
  const wsAvailable = ws && ws.readyState === 1;

  if (store.get('micActive')) {
    // ─── Apagar micrófono ───────────────────────────
    _micStarting = false;
    if (_localAudioRestartTimer) {
      clearTimeout(_localAudioRestartTimer);
      _localAudioRestartTimer = null;
    }
    if (userInitiated) store.set('alwaysListen', false);
    if (mode === 'local' && !wsAvailable) {
      try { await window.electronAPI.stopLocalAudio(); } catch (e) {}
      _localAudioActive = false;
      _log('info', 'Audio local detenido');
    } else {
      _stopRecording();
    }
    store.set('micActive', false);
    store.set('lastSpeechDetectedTime', 0);
    store.set('lastTranscriptionTime', 0);
    updateDiagnostics('Micrófono', 'INACTIVO');
    _setMicBtnOn(false);
    store.setState(STATE.IDLE);
    _log('info', 'Micrófono desactivado');
    if (window.JarvisSupervisor) window.JarvisSupervisor.record('mic', { active: false });
    return;
  }

  // ─── Encender micrófono ────────────────────────
  if (userInitiated) store.set('alwaysListen', true);
  _micStarting = true;

  if (mode === 'local' && !wsAvailable) {
    try {
      await _activateLocalAudio(skipStopAudio);
      store.set('micActive', true);
      updateDiagnostics('Micrófono', 'ACTIVO');
    } catch (err) {
      _log('error', `Error al activar audio local: ${err.message}`);
      const { showSystemErrorMessage } = await import('../chat/messages.js');
      if (userInitiated) showSystemErrorMessage(`Audio local no disponible: ${err.message}`);
      if (store.get('alwaysListen')) {
        _localAudioRestartTimer = setTimeout(() => restartMicrophone(true), _micRetryDelay());
      }
    }
    _micStarting = false;
    return;
  }

  if (!wsAvailable) {
    _log('info', 'Mic: WS cerrado — reconectando');
    const { connectWebSocket } = await import('../Core/Connection/manager.js');
    await connectWebSocket();
    let reconectado = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (window.ws?.readyState === 1) { reconectado = true; break; }
    }
    if (reconectado) {
      try {
        await _activateCloudMic(skipStopAudio);
        store.set('micActive', true);
        updateDiagnostics('Micrófono', 'ACTIVO');
      } catch (err) {
        _log('error', `Mic post-reconnect: ${err.message}`);
        if (userInitiated) {
          const { showSystemErrorMessage } = await import('../chat/messages.js');
          showSystemErrorMessage('Micrófono no disponible tras reconexión.');
        }
      }
      _micStarting = false;
      return;
    }
    _micStarting = false;
    if (userInitiated) {
      const { showSystemErrorMessage } = await import('../chat/messages.js');
      showSystemErrorMessage('Sin conexión. Activa Modo Local en Configuración.');
    }
    return;
  }

  try {
    await _activateCloudMic(skipStopAudio);
    store.set('micActive', true);
    updateDiagnostics('Micrófono', 'ACTIVO');
  } catch (err) {
    _log('error', `Error al activar micrófono: ${err.message}`);
    if (userInitiated) {
      const { showSystemErrorMessage } = await import('../chat/messages.js');
      showSystemErrorMessage('No se pudo acceder al micrófono. Verifique los permisos.');
    }
  }
  _micStarting = false;
}

// ─── Suscripción a transcripciones locales ────────────────
let _localTranscriptCleanup = null;

export function initLocalAudioListener() {
  if (_localTranscriptCleanup) return;
  _localTranscriptCleanup = window.electronAPI.onLocalTranscript((data) => {
    if (!data || !data.text) return;
    const text = data.text.trim();
    if (!text) return;

    _log('info', `[LOCAL TRANSCRIPT] "${text}" (prob: ${data.prob})`);

    // Enviar a Ollama local como si fuera texto escrito
    import('../chat/messages.js').then(m => {
      // Mostrar burbuja de usuario
      m.appendUserMessage(text);

      // Incrementar contador por mensaje de usuario
      const count = (store.get('messageCount') || 0) + 1;
      store.set('messageCount', count);
      const msgCountEl = document.getElementById('diag-msg-count');
      if (msgCountEl) msgCountEl.innerText = `${count}`;

      // Enviar a modelo local
      import('../system/model-manager.js').then(mm => {
        if (mm.getMode() !== 'local') return;
        m._askLocalAndRender(text);
      });
    });
  });

  // Manejar errores del audio local
  window.electronAPI.onLocalAudioError((data) => {
    _log('error', `[LOCAL AUDIO ERROR] ${data.error || 'desconocido'}`);
    _localAudioActive = false;
    if (store.get('alwaysListen')) {
      if (_localAudioRestartTimer) clearTimeout(_localAudioRestartTimer);
      _localAudioRestartTimer = setTimeout(() => {
        _log('warn', 'Reiniciando audio local tras error...');
        restartMicrophone(true);
      }, _micRetryDelay());
    } else if (store.get('micActive')) {
      store.set('micActive', false);
      _setMicBtnOn(false);
    }
  });
}

export function getRecordingContext() {
  return recordingCtx;
}

export function stopLocalAudioListener() {
  if (_localTranscriptCleanup) {
    _localTranscriptCleanup();
    _localTranscriptCleanup = null;
  }
}
