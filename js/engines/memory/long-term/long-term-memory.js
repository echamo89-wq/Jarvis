/**
 * Memory Engine — Long-Term Memory Module.
 * Persiste preferencias del usuario, configuraciones arraigadas, perfiles de identidad y hábitos.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('MEM-LONGTERM');

let _profile = {};

function _load() {
  try {
    const saved = localStorage.getItem('jarvis_longterm_memory');
    if (saved) {
      _profile = JSON.parse(saved);
    }
  } catch (e) {
    _log.error(`Error al cargar memoria a largo plazo: ${e.message}`);
  }
}

function _save() {
  try {
    localStorage.setItem('jarvis_longterm_memory', JSON.stringify(_profile));
  } catch (e) {
    _log.error(`Error al guardar memoria a largo plazo: ${e.message}`);
  }
}

// Cargar al iniciar
_load();

export const longTermMemory = {
  setPreference(key, value) {
    _profile[key] = value;
    _save();
    _log.info(`Preferencia guardada: ${key}`);
    kernel.bus.emit('memory:longterm-updated', { key, value });
  },

  getPreference(key) {
    return _profile[key];
  },

  getProfile() {
    return { ..._profile };
  },

  clear() {
    _profile = {};
    _save();
  }
};

export default longTermMemory;
