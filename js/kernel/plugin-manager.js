/**
 * Plugin Manager Central del Kernel de JARVIS.
 * Carga, inicializa, audita y descarga plugins dinámicamente.
 * Cada plugin expone un manifiesto, herramientas opcionales y un ciclo de vida (init, destroy).
 */

import { bus } from './event-bus.js';
import { createLogger } from './logger.js';

const _log = createLogger('PLUGINS');

const _plugins = new Map(); // pluginName -> pluginInstance

export const pluginManager = {
  /**
   * Registrar e inicializar un plugin.
   * @param {Object} plugin - El objeto plugin que cumple el contrato
   * @param {Object} plugin.manifest - { name, version, permissions, description }
   * @param {Function} plugin.init - async (kernel) => void
   * @param {Function} plugin.destroy - async () => void
   * @param {Array<Object>} [plugin.tools] - Herramientas declaradas para LLM
   */
  async register(plugin) {
    if (!plugin || !plugin.manifest || !plugin.manifest.name) {
      _log.error('Contrato de plugin inválido: Falta manifiesto o nombre.');
      throw new Error('Plugin contract invalid');
    }

    const name = plugin.manifest.name;
    if (_plugins.has(name)) {
      _log.warn(`El plugin "${name}" ya está registrado. Ignorando.`);
      return;
    }

    _log.info(`Cargando plugin "${name}" v${plugin.manifest.version || '1.0.0'}...`);

    try {
      // 1. Inicializar
      if (typeof plugin.init === 'function') {
        // Pasar el Kernel de JARVIS como parámetro de inyección de dependencias
        await plugin.init(window._jarvisKernel);
      }

      _plugins.set(name, plugin);
      _log.info(`Plugin "${name}" cargado con éxito.`);
      
      bus.emit('plugin:registered', { name, version: plugin.manifest.version });
    } catch (e) {
      _log.error(`Error al inicializar plugin "${name}": ${e.message}`);
      throw e;
    }
  },

  /**
   * Descargar y destruir un plugin.
   */
  async unregister(name) {
    const plugin = _plugins.get(name);
    if (!plugin) return;

    _log.info(`Descargando plugin "${name}"...`);

    try {
      if (typeof plugin.destroy === 'function') {
        await plugin.destroy();
      }
      _plugins.delete(name);
      _log.info(`Plugin "${name}" descargado con éxito.`);
      bus.emit('plugin:unregistered', { name });
    } catch (e) {
      _log.error(`Error al destruir plugin "${name}": ${e.message}`);
    }
  },

  getPlugin(name) {
    return _plugins.get(name);
  },

  listPlugins() {
    return Array.from(_plugins.values()).map(p => ({
      manifest: p.manifest,
      hasTools: !!(p.tools && p.tools.length)
    }));
  },

  /**
   * Obtener todas las herramientas registradas por los plugins activos para inyección en el LLM.
   */
  getAllTools() {
    const tools = [];
    for (const plugin of _plugins.values()) {
      if (Array.isArray(plugin.tools)) {
        tools.push(...plugin.tools);
      }
    }
    return tools;
  }
};

export default pluginManager;
