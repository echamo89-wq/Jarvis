/**
 * Memory Engine — Semantic Memory Module.
 * Almacena conceptos, reglas generales y hechos estables del mundo o del usuario.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('MEM-SEMANTIC');

const _facts = new Map(); // key -> fact

export const semanticMemory = {
  /**
   * Guardar un hecho.
   */
  setFact(key, value) {
    _facts.set(key, value);
    _log.info(`Hecho guardado: ${key} = ${value}`);
    kernel.bus.emit('memory:semantic-updated', { key, value });
  },

  /**
   * Recuperar un hecho.
   */
  getFact(key) {
    return _facts.get(key);
  },

  /**
   * Listar todos los hechos conocidos.
   */
  listFacts() {
    return Array.from(_facts.entries()).map(([k, v]) => ({ key: k, value: v }));
  },

  deleteFact(key) {
    _facts.delete(key);
    kernel.bus.emit('memory:semantic-deleted', { key });
  }
};

export default semanticMemory;
