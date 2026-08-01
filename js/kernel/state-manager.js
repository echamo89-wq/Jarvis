/**
 * State Manager Central del Kernel de JARVIS.
 * Estado reactivo, validación de tipos por esquema, historial de transiciones, snapshots y middleware.
 */

import { bus } from './event-bus.js';
import { createLogger } from './logger.js';

const _log = createLogger('STATE');

const STATE_SCHEMA = {
  machine: { type: 'string', default: 'idle', valid: ['idle', 'connecting', 'listening', 'speaking', 'working', 'error', 'sleeping', 'updating'] },
  toolCount: { type: 'number', default: 0 },
  toolStartTime: { type: 'number', default: null, nullable: true },
  waitingForResponse: { type: 'boolean', default: false },
  activeProvider: { type: 'string', default: 'gemini', valid: ['gemini'] },
  isTtsSpeaking: { type: 'boolean', default: false },
  focusMode: { type: 'boolean', default: true },
  alwaysOn: { type: 'boolean', default: false },
  graphicsQuality: { type: 'string', default: 'high', valid: ['low', 'medium', 'high'] }
};

const _state = {};
const _listeners = new Map(); // key -> Array of { fn, keysArray }
const _transitionHistory = [];
const HISTORY_LIMIT = 50;
const _middlewares = [];

// Inicializar estado con defaults
Object.keys(STATE_SCHEMA).forEach(key => {
  _state[key] = STATE_SCHEMA[key].default;
});

export const stateManager = {
  /**
   * Obtener valor de una clave o copia completa del estado.
   */
  get(key) {
    if (key) {
      return _state[key];
    }
    return { ..._state };
  },

  /**
   * Modificar el valor de una clave.
   */
  set(key, value) {
    const spec = STATE_SCHEMA[key];
    if (!spec) {
      _log.warn(`Intento de setear clave no registrada en el esquema: ${key}`);
      return;
    }

    // Validación de tipo
    if (value === null && spec.nullable) {
      // Permitido
    } else if (typeof value !== spec.type) {
      _log.warn(`Tipo incorrecto para clave "${key}". Esperado ${spec.type}, recibido ${typeof value}`);
      return;
    }

    // Validación de valores específicos
    if (spec.valid && !spec.valid.includes(value)) {
      _log.warn(`Valor inválido para clave "${key}": ${value}. Valores permitidos: ${spec.valid.join(', ')}`);
      return;
    }

    const prev = _state[key];
    if (prev === value) return;

    // Ejecutar middlewares
    let newValue = value;
    let cancelled = false;
    const context = {
      key,
      prev,
      cancel() { cancelled = true; }
    };

    for (const mw of _middlewares) {
      try {
        newValue = mw(newValue, context);
        if (cancelled) break;
      } catch (e) {
        _log.error(`Error en middleware de estado para ${key}: ${e.message}`);
      }
    }

    if (cancelled) return;

    _state[key] = newValue;

    // Registrar historial si es la máquina de estados principal
    if (key === 'machine') {
      _transitionHistory.push({
        from: prev,
        to: newValue,
        timestamp: Date.now()
      });
      if (_transitionHistory.length > HISTORY_LIMIT) {
        _transitionHistory.shift();
      }
      bus.emit('state:changed', { from: prev, to: newValue });
    }

    // Emitir eventos de cambio generales
    bus.emit(`change:${key}`, { key, prev, current: newValue });

    // Notificar listeners reactivos
    _listeners.forEach((sub, fn) => {
      if (sub.keysArray.includes(key)) {
        try {
          fn(newValue, prev, key);
        } catch (e) {
          _log.error(`Error en listener de cambio para ${key}: ${e.message}`);
        }
      }
    });
  },

  /**
   * Modificar el estado de la máquina principal.
   */
  setState(next) {
    this.set('machine', next);
  },

  getState() {
    return this.get('machine');
  },

  /**
   * Suscribirse a cambios en claves específicas.
   * @param {Array<string>|string} keys - Clave o lista de claves a observar
   * @param {Function} fn - Callback (current, prev, key)
   */
  on(keys, fn) {
    const keysArray = Array.isArray(keys) ? keys : [keys];
    _listeners.set(fn, { keysArray });
    return () => this.off(fn);
  },

  off(fn) {
    _listeners.delete(fn);
  },

  /**
   * Registrar middleware para interceptar transiciones de estado.
   */
  use(mw) {
    _middlewares.push(mw);
  },

  /**
   * Capturar snapshot completo del estado.
   */
  createSnapshot() {
    return {
      state: { ..._state },
      timestamp: Date.now()
    };
  },

  /**
   * Restaurar estado a partir de un snapshot.
   */
  restoreSnapshot(snapshot) {
    if (!snapshot || !snapshot.state) return;
    Object.keys(snapshot.state).forEach(key => {
      this.set(key, snapshot.state[key]);
    });
    _log.info('Snapshot de estado restaurado');
  },

  getHistory() {
    return _transitionHistory.slice();
  }
};

export default stateManager;
