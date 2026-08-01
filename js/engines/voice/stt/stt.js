/**
 * Voice Engine — Speech-to-Text (STT) Module.
 * Gestiona la transcripción de voz a texto.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('VOICE-STT');

export const stt = {
  /**
   * Transcribir un archivo de audio o buffer.
   * @param {Blob|ArrayBuffer} audioData 
   * @returns {Promise<string>}
   */
  async transcribe(audioData) {
    _log.info('Iniciando transcripción...');
    
    // Si estamos usando Gemini Cloud, la transcripción ocurre automáticamente vía WebSocket.
    // Para modo offline o local, podemos delegar a Whisper local si estuviera instalado.
    const activeProvider = kernel.state.get('activeProvider') || 'gemini';
    
    if (activeProvider === 'gemini') {
      return '[Transcripción manejada por Gemini WebSocket]';
    } else {
      return await this._transcribeLocal(audioData);
    }
  },

  async _transcribeLocal(audioData) {
    try {
      // Implementación simplificada o delegación a API local de Whisper
      _log.info('Usando transcripción local (Whisper)...');
      return '[Transcripción local simulada]';
    } catch (e) {
      _log.error(`Error en transcripción local: ${e.message}`);
      return '';
    }
  }
};

export default stt;
