import { store } from '../state/store.js';
import { STATE, EVENTS } from '../state/constants.js';
import { bus } from '../utils/event-bus.js';

let audioCtx = null;
let nextPlayTime = 0;
let _safetyTimeouts = [];

import { createLogger } from '../utils/logger.js';
const _log = createLogger('AUDIO');

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    nextPlayTime = audioCtx.currentTime;
  }
}

export function getAudioContext() {
  return audioCtx;
}

function _playChunk(base64Data) {
  if (!audioCtx || audioCtx.state === 'closed') return;
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
  const sources = store.get('activeSources');
  sources.push(source);
  store.set('activeSources', [...sources]);
  store.set('jarvisSpeakingSince', Date.now());
  store.setState(STATE.SPEAKING);
  bus.emit(EVENTS.AUDIO_START, {});
  const safetyTimeout = setTimeout(() => {
    const current = store.get('activeSources');
    const idx = current.indexOf(source);
    if (idx !== -1) {
      current.splice(idx, 1);
      store.set('activeSources', [...current]);
      if (current.length === 0) _onSpeechEnd();
    }
    _log('warn', `Safety timeout for blob ${base64Data.length}`);
  }, Math.max(30000, audioBuffer.duration * 1000 + 5000));
  _safetyTimeouts.push(safetyTimeout);
  source.onended = () => {
    clearTimeout(safetyTimeout);
    _safetyTimeouts = _safetyTimeouts.filter(t => t !== safetyTimeout);
    const current = store.get('activeSources');
    const idx = current.indexOf(source);
    if (idx !== -1) {
      current.splice(idx, 1);
      store.set('activeSources', [...current]);
      if (current.length === 0) _onSpeechEnd();
    }
  };
}

export function playPCMChunk(base64Data) {
  if (!base64Data) {
    _log('warn', 'playPCMChunk llamada sin datos');
    return;
  }
  if (store.get('isJarvisMuted')) return;
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => _log('error', `Error al reanudar AudioContext: ${e.message}`));
    setTimeout(() => _playChunk(base64Data), 100);
    return;
  }
  _playChunk(base64Data);
}

function _onSpeechEnd() {
  store.set('jarvisSpeakingSince', 0);
  if (store.get('toolCount') > 0 || store.get('isJarvisMuted')) return;
  store.setState(STATE.IDLE);
}

export function stopAudioPlayback() {
  // Limpiar todos los safety timeouts pendientes
  _safetyTimeouts.forEach(t => clearTimeout(t));
  _safetyTimeouts = [];
  const sources = store.get('activeSources');
  [...sources].forEach(source => {
    try {
      source.onended = null;
      source.stop();
      source.disconnect();
    } catch (e) {
      _log('warn', `stopAudioPlayback: ${e.message}`);
    }
  });
  store.set('activeSources', []);
  store.set('_lastPlaybackEnded', Date.now());
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
    _log('warn', `SFX error: ${e.message}`);
  }
}

// Hablar con la MISMA voz de Gemini del WebSocket (síntesis REST + pipeline PCM)
export async function speakWithGeminiVoice(text) {
  if (store.get('isJarvisMuted')) return;
  const cleaned = (text || '')
    .replace(/<(?:think|thinking)>[\s\S]*?<\/\1>/gi, '')
    .replace(/[*#_`]/g, '')
    .trim();
  if (!cleaned) return;
  const speechText = cleaned.length > 1200 ? cleaned.slice(0, 1200) + '…' : cleaned;
  stopAudioPlayback();
  if (!window.electronAPI?.geminiTts) {
    _log('warn', 'geminiTts no disponible — usando voz local');
    speakLocalText(speechText);
    return;
  }
  try {
    const voice = store.get('userVoice') || 'Fenrir';
    const result = await window.electronAPI.geminiTts({ text: speechText, voice });
    if (!result?.success || !result?.audioBase64) {
      throw new Error(result?.error || 'TTS falló');
    }
    const raw = atob(result.audioBase64);
    let pcmBase64 = result.audioBase64;
    if (raw.length > 44 &&
        raw.charCodeAt(0) === 0x52 && raw.charCodeAt(1) === 0x49 &&
        raw.charCodeAt(2) === 0x46 && raw.charCodeAt(3) === 0x46) {
      let chunked = '';
      for (let i = 44; i < raw.length; i += 8192) {
        const slice = raw.slice(i, i + 8192);
        let bin = '';
        for (let j = 0; j < slice.length; j++) bin += String.fromCharCode(slice.charCodeAt(j));
        chunked += bin;
      }
      pcmBase64 = btoa(chunked);
      _log('info', 'Header WAV removido — PCM 24kHz');
    }
    playPCMChunk(pcmBase64);
  } catch (err) {
    _log('warn', `Gemini TTS falló (${err.message}) — usando voz local`);
    speakLocalText(speechText);
  }
}

export function speakLocalText(text) {
  stopAudioPlayback();
  if (typeof window.speechSynthesis === 'undefined') return;
  window.speechSynthesis.cancel();
  
  if (!text) return;
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
                      .replace(/[*#_`]/g, '')
                      .trim();
  if (!cleaned) return;
  
  const utterance = new SpeechSynthesisUtterance(cleaned);
  const selectedVoice = localStorage.getItem('jarvis_local_voice');
  if (selectedVoice) {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) utterance.voice = voice;
  }
  
  utterance.onstart = () => {
    store.setState(STATE.SPEAKING);
    store.set('isTtsSpeaking', true);
  };
  utterance.onend = () => {
    store.set('isTtsSpeaking', false);
    _onSpeechEnd();
  };
  utterance.onerror = () => {
    store.set('isTtsSpeaking', false);
    _onSpeechEnd();
  };
  window.speechSynthesis.speak(utterance);
}

// Auto-resume AudioContext on first user interaction to satisfy browser autoplay policies
function _setupAutoplayHandler() {
  const resume = () => {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        _log('info', 'AudioContext reanudado con éxito por interacción del usuario');
      }).catch(e => _log('warn', `Auto-resume falló: ${e.message}`));
    }
    // Remove listeners after first interaction
    document.removeEventListener('click', resume);
    document.removeEventListener('keydown', resume);
    document.removeEventListener('touchstart', resume);
  };
  document.addEventListener('click', resume);
  document.addEventListener('keydown', resume);
  document.addEventListener('touchstart', resume);
}

_setupAutoplayHandler();

