/**
 * Voice Engine — Text-to-Speech (TTS) Module.
 * Convierte texto de respuesta a voz audible usando la síntesis local del navegador o de Gemini.
 */

import { kernel } from '../../../kernel/index.js';
import { stopAudioPlayback } from '../stream/stream.js';

const _log = kernel.logger.create('VOICE-TTS');

export const tts = {
  /**
   * Sintetizar y hablar texto utilizando el motor TTS local.
   * @param {string} text - El texto a hablar
   */
  speakLocal(text) {
    stopAudioPlayback();
    if (typeof window.speechSynthesis === 'undefined') {
      _log.warn('Synthesis de voz no soportada por el navegador.');
      return;
    }
    
    window.speechSynthesis.cancel();
    
    if (!text) return;
    
    // Limpiar etiquetas de razonamiento y markdown
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
      kernel.state.setState('speaking');
      kernel.state.set('isTtsSpeaking', true);
      kernel.bus.emit('audio:start');
    };
    
    utterance.onend = () => {
      kernel.state.set('isTtsSpeaking', false);
      this._onSpeechEnd();
    };
    
    utterance.onerror = (e) => {
      _log.error(`TTS Error: ${e.error}`);
      kernel.state.set('isTtsSpeaking', false);
      this._onSpeechEnd();
    };
    
    window.speechSynthesis.speak(utterance);
  },

  /**
   * Detener la síntesis activa.
   */
  cancel() {
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
      kernel.state.set('isTtsSpeaking', false);
    }
  },

  _onSpeechEnd() {
    kernel.bus.emit('audio:end');
    if (kernel.state.get('toolCount') > 0) return;
    kernel.state.setState('idle');
  }
};

export default tts;
