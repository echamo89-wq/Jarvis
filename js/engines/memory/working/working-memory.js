/**
 * Memory Engine — Working Memory Module.
 * Gestiona el contexto activo a corto plazo, el buffer del turno actual y la ventana deslizante de conversación.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('MEM-WORKING');

let _activeTurnText = '';
const _conversationWindow = [];
const WINDOW_LIMIT = 15; // Máximo 15 mensajes en memoria de trabajo rápida

export const workingMemory = {
  /**
   * Añadir un mensaje al buffer de conversación activo.
   */
  appendMessage(role, text) {
    _conversationWindow.push({ role, text, timestamp: Date.now() });
    if (_conversationWindow.length > WINDOW_LIMIT) {
      _conversationWindow.shift();
    }
    _log.info(`Mensaje añadido a working memory (${role}).`);
  },

  /**
   * Obtener la conversación actual.
   */
  getActiveContext() {
    return _conversationWindow.slice();
  },

  setTurnText(text) {
    _activeTurnText = text;
  },

  getTurnText() {
    return _activeTurnText;
  },

  clear() {
    _conversationWindow.length = 0;
    _activeTurnText = '';
  }
};

export default workingMemory;
