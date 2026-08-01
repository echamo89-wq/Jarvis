/**
 * Event Bus Central para el Kernel de JARVIS.
 * Soporta namespaces, wildcards, replay de eventos, middleware interceptor y prioridades.
 */

import { createLogger } from './logger.js';

const _log = createLogger('EVENT-BUS');

const _listeners = new Map(); // eventName -> Array of { fn, priority, once }
const _lastEvents = new Map(); // eventName -> data (para replay)
const _middlewares = [];

export const bus = {
  /**
   * Suscribirse a un evento.
   * @param {string} eventPattern - Nombre o patrón de evento (ej: 'voice:*', 'state:changed', '*')
   * @param {Function} fn - Callback
   * @param {Object} options - Opciones de suscripción
   * @param {number} options.priority - Prioridad de ejecución (mayor valor = se ejecuta antes, default 0)
   * @param {boolean} options.once - Si es true, se auto-desregistra tras el primer disparo
   * @param {boolean} options.replay - Si es true, ejecuta inmediatamente el callback con el último evento emitido de este tipo
   */
  on(eventPattern, fn, options = {}) {
    const opts = { priority: 0, once: false, replay: false, ...options };
    
    if (!_listeners.has(eventPattern)) {
      _listeners.set(eventPattern, []);
    }
    
    const list = _listeners.get(eventPattern);
    list.push({ fn, priority: opts.priority, once: opts.once });
    // Ordenar descendente por prioridad
    list.sort((a, b) => b.priority - a.priority);

    // Si requiere replay y hay un evento previo guardado
    if (opts.replay && _lastEvents.has(eventPattern)) {
      try {
        fn(_lastEvents.get(eventPattern), eventPattern);
      } catch (e) {
        _log.error(`Error en callback replay para ${eventPattern}: ${e.message}`);
      }
    }

    return () => this.off(eventPattern, fn);
  },

  /**
   * Suscribirse a un evento solo una vez.
   */
  once(event, fn, options = {}) {
    return this.on(event, fn, { ...options, once: true });
  },

  /**
   * Cancelar suscripción.
   */
  off(eventPattern, fn) {
    if (!_listeners.has(eventPattern)) return;
    const filtered = _listeners.get(eventPattern).filter(item => item.fn !== fn);
    if (filtered.length === 0) {
      _listeners.delete(eventPattern);
    } else {
      _listeners.set(eventPattern, filtered);
    }
  },

  /**
   * Emitir un evento al bus.
   */
  emit(event, data) {
    // 1. Ejecutar middlewares (pueden modificar o cancelar el evento)
    let currentData = data;
    let cancelled = false;

    const context = {
      event,
      cancel() { cancelled = true; }
    };

    for (const mw of _middlewares) {
      try {
        currentData = mw(currentData, context);
        if (cancelled) break;
      } catch (e) {
        _log.error(`Error en middleware de EventBus al procesar ${event}: ${e.message}`);
      }
    }

    if (cancelled) {
      _log.debug(`Evento ${event} cancelado por middleware`);
      return;
    }

    // Guardar para replay
    _lastEvents.set(event, currentData);

    // 2. Disparar listeners específicos, con wildcards y globales
    const matchedItems = [];

    // Recorrer todos los patrones registrados
    for (const [pattern, list] of _listeners.entries()) {
      if (pattern === '*' || pattern === event || _matchPattern(pattern, event)) {
        list.forEach(item => {
          matchedItems.push({ ...item, pattern });
        });
      }
    }

    // Ordenar de nuevo todo por prioridad para mantener consistencia
    matchedItems.sort((a, b) => b.priority - a.priority);

    // Ejecutar listeners
    matchedItems.forEach(item => {
      try {
        item.fn(currentData, event);
      } catch (e) {
        _log.error(`Error en listener de ${event} (patrón: ${item.pattern}): ${e.message}`);
      }

      // Auto-remover si es "once"
      if (item.once) {
        this.off(item.pattern, item.fn);
      }
    });
  },

  /**
   * Registrar un middleware interceptor global.
   * @param {Function} mw - Callback: (data, context) => data
   */
  use(mw) {
    _middlewares.push(mw);
  },

  /**
   * Limpiar todos los listeners.
   */
  clear() {
    _listeners.clear();
    _lastEvents.clear();
    _middlewares.length = 0;
  },

  getHistory() {
    return Array.from(_lastEvents.entries()).map(([event, data]) => ({ event, data }));
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _matchPattern(pattern, event) {
  if (!pattern.includes('*')) return false;
  // Convertir patrón a regex simple. ej: 'voice:*' -> /^voice:.*$/
  const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
  const rx = new RegExp(regexStr);
  return rx.test(event);
}

export default bus;
