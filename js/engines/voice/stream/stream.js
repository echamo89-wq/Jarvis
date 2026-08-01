/**
 * Voice Engine — PCM Stream Module.
 * Gestiona el contexto de audio y la reproducción/transmisión de flujos PCM.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('VOICE-STREAM');

let audioCtx = null;
let nextPlayTime = 0;
let _safetyTimeouts = [];
const _activeSources = [];

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    nextPlayTime = audioCtx.currentTime;
  }
}

export function getAudioContext() {
  return audioCtx;
}

export function playPCMChunk(base64Data) {
  if (!base64Data) return;
  if (!audioCtx) initAudio();

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => _log.error(`Reanudación fallida de AudioContext: ${e.message}`));
    setTimeout(() => _playChunk(base64Data), 100);
    return;
  }
  _playChunk(base64Data);
}

export function stopAudioPlayback() {
  _safetyTimeouts.forEach(t => clearTimeout(t));
  _safetyTimeouts = [];
  
  _activeSources.forEach(source => {
    try {
      source.onended = null;
      source.stop();
      source.disconnect();
    } catch {}
  });
  _activeSources.length = 0;
  
  if (audioCtx) nextPlayTime = audioCtx.currentTime;
  _onSpeechEnd();
}

export function playSystemSound(type) {
  const sfx = localStorage.getItem('jarvis_sfx') !== 'false';
  if (!sfx) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === 'connect') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'disconnect') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'ready') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
      osc.frequency.setValueAtTime(1800, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.2);
    }
  } catch (e) {
    _log.warn(`Error al reproducir SFX: ${e.message}`);
  }
}

// ─── Internals ─────────────────────────────────────────────────────────────────

function _playChunk(base64Data) {
  if (!audioCtx || audioCtx.state === 'closed') return;
  
  try {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

    const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    const startAt = Math.max(audioCtx.currentTime, nextPlayTime);
    source.start(startAt);
    nextPlayTime = startAt + audioBuffer.duration;

    _activeSources.push(source);
    kernel.state.setState('speaking');
    kernel.bus.emit('audio:start');

    const safetyTimeout = setTimeout(() => {
      const idx = _activeSources.indexOf(source);
      if (idx !== -1) {
        _activeSources.splice(idx, 1);
        if (_activeSources.length === 0) _onSpeechEnd();
      }
    }, 30000);
    _safetyTimeouts.push(safetyTimeout);

    source.onended = () => {
      clearTimeout(safetyTimeout);
      _safetyTimeouts = _safetyTimeouts.filter(t => t !== safetyTimeout);
      const idx = _activeSources.indexOf(source);
      if (idx !== -1) {
        _activeSources.splice(idx, 1);
        if (_activeSources.length === 0) _onSpeechEnd();
      }
    };
  } catch (e) {
    _log.error(`_playChunk failed: ${e.message}`);
  }
}

function _onSpeechEnd() {
  kernel.bus.emit('audio:end');
  if (kernel.state.get('toolCount') > 0) return;
  kernel.state.setState('idle');
}
