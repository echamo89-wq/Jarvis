/**
 * Config Manager Central del Kernel de JARVIS.
 * Esquema declarativo de configuración con persistencia, debounce de guardado, capas de sesión y reactividad.
 */

import { bus } from './event-bus.js';
import { createLogger } from './logger.js';

const _log = createLogger('CONFIG');

const CONFIG_SCHEMA = {
  theme: { type: 'string', default: 'dark', valid: ['light', 'dark', 'matrix', 'cyberpunk'] },
  language: {
    type: 'string', default: 'es',
    valid: ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'ar', 'ko', 'nl', 'pl', 'tr', 'vi', 'hi', 'sv', 'no', 'da', 'fi', 'el', 'cs', 'ro', 'hu', 'uk', 'he', 'th', 'id']
  },
  activeProvider: { type: 'string', default: 'gemini', valid: ['gemini'] },
  volume: { type: 'number', default: 80, min: 0, max: 100 },
  autoVerifyOauth: { type: 'boolean', default: false },
  enableLocalTts: { type: 'boolean', default: true },
  enableLocalVad: { type: 'boolean', default: true }
};

let _userConfig = {};
let _sessionOverrides = {};
let _saveDebounceTimer = null;
const _listeners = new Map(); // key -> Array of callbacks

// Cargar configuración de localStorage
function _loadConfig() {
  try {
    const saved = localStorage.getItem('jarvis_kernel_config');
    if (saved) {
      _userConfig = JSON.parse(saved);
    }
  } catch (e) {
    _log.error(`Error al cargar configuración: ${e.message}`);
    _userConfig = {};
  }
}

// Inicializar de inmediato
_loadConfig();

export const configManager = {
  /**
   * Obtener el valor efectivo de una configuración (Sesión -> Usuario -> Default).
   */
  get(key) {
    const spec = CONFIG_SCHEMA[key];
    if (!spec) {
      _log.warn(`Clave de configuración no registrada: ${key}`);
      return undefined;
    }

    // 1. Session Overrides
    if (_sessionOverrides[key] !== undefined) {
      return _sessionOverrides[key];
    }

    // 2. User Config
    if (_userConfig[key] !== undefined) {
      return _userConfig[key];
    }

    // 3. Default
    return spec.default;
  },

  /**
   * Modificar el valor de una configuración (se persiste automáticamente).
   */
  set(key, value) {
    const spec = CONFIG_SCHEMA[key];
    if (!spec) {
      _log.warn(`Clave de configuración no registrada: ${key}`);
      return;
    }

    // Validar tipo
    if (typeof value !== spec.type) {
      _log.warn(`Tipo incorrecto para configuración "${key}". Esperado ${spec.type}, recibido ${typeof value}`);
      return;
    }

    // Validar rango numérico
    if (spec.type === 'number') {
      if (spec.min !== undefined && value < spec.min) return;
      if (spec.max !== undefined && value > spec.max) return;
    }

    // Validar valores específicos
    if (spec.valid && !spec.valid.includes(value)) {
      _log.warn(`Valor no permitido para "${key}": ${value}`);
      return;
    }

    const prev = this.get(key);
    if (prev === value) return;

    _userConfig[key] = value;
    
    // Notificar reactivamente
    this._notifyChange(key, value, prev);

    // Persistencia con debounce de 2s
    this._queueSave();
  },

  /**
   * Establecer un override temporal para la sesión actual (no se guarda en disco).
   */
  setOverride(key, value) {
    if (!CONFIG_SCHEMA[key]) return;
    const prev = this.get(key);
    _sessionOverrides[key] = value;
    this._notifyChange(key, value, prev);
  },

  /**
   * Limpiar un override de sesión temporal.
   */
  clearOverride(key) {
    if (_sessionOverrides[key] === undefined) return;
    const prev = this.get(key);
    delete _sessionOverrides[key];
    this._notifyChange(key, this.get(key), prev);
  },

  /**
   * Registrar callback para reaccionar al cambio de una configuración.
   */
  on(key, fn) {
    if (!CONFIG_SCHEMA[key]) return () => {};
    if (!_listeners.has(key)) {
      _listeners.set(key, []);
    }
    _listeners.get(key).push(fn);
    return () => this.off(key, fn);
  },

  off(key, fn) {
    if (!_listeners.has(key)) return;
    _listeners.set(key, _listeners.get(key).filter(f => f !== fn));
  },

  /**
   * Obtener toda la configuración como un objeto plano.
   */
  getAll() {
    const res = {};
    Object.keys(CONFIG_SCHEMA).forEach(key => {
      res[key] = this.get(key);
    });
    return res;
  },

  // ─── Internos ─────────────────────────────────────────────────────────────────

  _notifyChange(key, current, prev) {
    const list = _listeners.get(key);
    if (list) {
      list.forEach(fn => {
        try { fn(current, prev); } catch (e) { _log.error(`Error en listener de config para ${key}: ${e.message}`); }
      });
    }
    bus.emit(`config:${key}-changed`, { key, current, prev });
  },

  _queueSave() {
    if (_saveDebounceTimer) {
      clearTimeout(_saveDebounceTimer);
    }
    _saveDebounceTimer = setTimeout(() => {
      try {
        localStorage.setItem('jarvis_kernel_config', JSON.stringify(_userConfig));
        _log.info('Configuración de usuario guardada con éxito.');
        bus.emit('config:saved');
      } catch (e) {
        _log.error(`Error al guardar configuración en localStorage: ${e.message}`);
      }
      _saveDebounceTimer = null;
    }, 2000);
  }
};

export default configManager;
