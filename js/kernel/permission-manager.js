/**
 * Permission Manager Central del Kernel de JARVIS.
 * Controla accesos a recursos críticos (micrófono, pantalla, sistema de archivos, automatización, Google OAuth, shell, etc.).
 */

import { bus } from './event-bus.js';
import { createLogger } from './logger.js';

const _log = createLogger('PERMISSIONS');

const VALID_SCOPES = [
  'microphone',
  'screen',
  'filesystem',
  'automation',
  'google',
  'notifications',
  'network',
  'shell'
];

let _permissions = {};

// Cargar permisos guardados
function _loadPermissions() {
  try {
    const saved = localStorage.getItem('jarvis_kernel_permissions');
    if (saved) {
      _permissions = JSON.parse(saved);
    }
  } catch (e) {
    _log.error(`Error al cargar permisos: ${e.message}`);
    _permissions = {};
  }
}

function _savePermissions() {
  try {
    localStorage.setItem('jarvis_kernel_permissions', JSON.stringify(_permissions));
  } catch (e) {
    _log.error(`Error al guardar permisos: ${e.message}`);
  }
}

// Inicializar de inmediato
_loadPermissions();
// Auto-conceder permisos esenciales para evitar prompts en cada captura
if (_permissions['screen'] !== 'granted') {
  _permissions['screen'] = 'granted';
  _savePermissions();
}

export const permissionManager = {
  /**
   * Verificar si un scope específico está concedido.
   * @param {string} scope - Scope de la lista VALID_SCOPES
   * @returns {boolean}
   */
  hasPermission(scope) {
    if (!VALID_SCOPES.includes(scope)) {
      _log.warn(`Verificación de scope no reconocido: ${scope}`);
      return false;
    }
    return _permissions[scope] === 'granted';
  },

  /**
   * Solicitar permiso para un scope. Si no existe, invoca una UI de prompt/dialog o auto-concede
   * si está en modo de desarrollo automatizado/configurado por el usuario.
   * @param {string} scope - Scope solicitado
   * @returns {Promise<boolean>}
   */
  async requestPermission(scope) {
    if (!VALID_SCOPES.includes(scope)) {
      _log.warn(`Solicitud de scope no reconocido: ${scope}`);
      return false;
    }

    if (this.hasPermission(scope)) {
      return true;
    }

    if (_permissions[scope] === 'denied') {
      _log.warn(`Scope ${scope} denegado previamente.`);
      return false;
    }

    bus.emit('permission:requested', { scope });
    _log.info(`Permiso solicitado para scope: ${scope}`);

    // Si hay un modal o diálogo registrado en el frontend, se le notifica.
    // Para simplificar, si estamos en modo offline / local o el usuario ya pre-aprobó todo
    // auto-concedemos temporalmente bajo aviso o mostramos una alerta interactiva si existe en el DOM.
    const granted = await _promptUserConsent(scope);
    
    if (granted) {
      _permissions[scope] = 'granted';
      _savePermissions();
      bus.emit('permission:granted', { scope });
      _log.info(`Permiso CONCEDIDO para scope: ${scope}`);
    } else {
      _permissions[scope] = 'denied';
      _savePermissions();
      bus.emit('permission:denied', { scope });
      _log.warn(`Permiso DENEGADO para scope: ${scope}`);
    }

    return granted;
  },

  /**
   * Forzar concesión de un permiso de manera manual o programática (configuración).
   */
  grant(scope) {
    if (!VALID_SCOPES.includes(scope)) return;
    _permissions[scope] = 'granted';
    _savePermissions();
    bus.emit('permission:granted', { scope });
  },

  /**
   * Revocar un permiso.
   */
  revoke(scope) {
    if (!VALID_SCOPES.includes(scope)) return;
    delete _permissions[scope];
    _savePermissions();
    bus.emit('permission:revoked', { scope });
  },

  /**
   * Resetear todos los permisos al estado inicial.
   */
  reset() {
    _permissions = {};
    _savePermissions();
    _log.info('Permisos reseteados con éxito');
  },

  getScopes() {
    return { ..._permissions };
  }
};

// ─── Internals ─────────────────────────────────────────────────────────────────

async function _promptUserConsent(scope) {
  // En Electron, podemos verificar si hay un handler global o UI
  // Como fallback seguro, si está corriendo en Electron y tenemos la confirmación por defecto del bot, concedemos.
  // De otro modo, preguntamos al usuario vía window.confirm o interfaz.
  if (typeof window !== 'undefined' && window.confirm) {
    // Si corre en Electron, a veces confirm no está disponible o es intrusivo,
    // por lo tanto chequeamos si está configurado en store
    const autoGrant = localStorage.getItem('jarvis_auto_grant_permissions') === 'true';
    if (autoGrant) return true;

    return new Promise((resolve) => {
      // Dialogo no bloqueante rápido
      const scopeNames = { microphone: 'Micrófono', screen: 'Pantalla', filesystem: 'Archivos', automation: 'Automatización', google: 'Google', notifications: 'Notificaciones', network: 'Red', shell: 'Terminal' };
      const scopeName = scopeNames[scope] || scope.toUpperCase();
      const ok = window.confirm(`🔒 Jarvis solicita permiso para acceder a: ${scopeName}\n\n¿Desea permitir este acceso?\n\n• "Aceptar" — Permitir acceso ahora.\n• "Cancelar" — Denegar acceso.`);
      resolve(ok);
    });
  }
  return true;
}

export default permissionManager;
