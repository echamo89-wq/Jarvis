/**
 * Memory Engine — Episodic Memory Module.
 * Almacena y recupera eventos con marca de tiempo, acciones recientes e interacciones del usuario.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('MEM-EPISODIC');

const _timeline = [];
const LIMIT = 100;

export const episodicMemory = {
  /**
   * Registrar un evento de interacción.
   * @param {string} type - Tipo de evento (ej: 'user_prompt', 'tool_execution')
   * @param {Object} details - Detalles del evento
   */
  logEvent(type, details) {
    const entry = {
      timestamp: Date.now(),
      type,
      details
    };
    _timeline.push(entry);
    if (_timeline.length > LIMIT) {
      _timeline.shift();
    }
    _log.info(`Evento registrado: ${type}`);
    kernel.bus.emit('memory:episodic-logged', entry);
  },

  /**
   * Obtener el historial de la línea de tiempo episódica.
   */
  getTimeline() {
    return _timeline.slice();
  },

  clear() {
    _timeline.length = 0;
  }
};

export default episodicMemory;
