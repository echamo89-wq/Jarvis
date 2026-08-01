/**
 * Voice Engine — Unified Entry Point.
 * Expone la API del motor de voz subdividido.
 */

import { stt } from './stt/stt.js';
import { tts } from './tts/tts.js';
import { initAudio, getAudioContext, playPCMChunk, stopAudioPlayback, playSystemSound } from './stream/stream.js';
import { turnManager } from './conversation/turn.js';

// Inicializar gestor de turnos
turnManager.init();

export {
  stt,
  tts,
  initAudio,
  getAudioContext,
  playPCMChunk,
  stopAudioPlayback,
  playSystemSound,
  turnManager
};
