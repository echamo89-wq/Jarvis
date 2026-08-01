/**
 * Kernel de JARVIS — Sistema Nervioso Central de la Aplicación.
 * Inicializa y expone todos los managers centrales (Event Bus, State, Logger, Permissions, Tasks, Config, Plugins, Metrics).
 */

import { bus } from './event-bus.js';
import { stateManager } from './state-manager.js';
import { createLogger, setLogLevel, getLogLevel, getLogs, clearLogs } from './logger.js';
import { permissionManager } from './permission-manager.js';
import { taskManager } from './task-manager.js';
import { configManager } from './config-manager.js';
import { pluginManager } from './plugin-manager.js';
import { metricsManager } from './metrics.js';

const _log = createLogger('KERNEL');

export const kernel = {
  bus,
  state: stateManager,
  logger: {
    create: createLogger,
    setLogLevel,
    getLogLevel,
    getLogs,
    clearLogs
  },
  permissions: permissionManager,
  tasks: taskManager,
  config: configManager,
  plugins: pluginManager,
  metrics: metricsManager,

  /**
   * Arrancar los sistemas centrales del Kernel.
   */
  async boot() {
    _log.info('=== INICIANDO KERNEL DE JARVIS ===');
    
    try {
      // 1. Inicializar Métricas
      metricsManager.init();

      // 2. Hacer disponible el Kernel en el ámbito global para inyección
      window._jarvisKernel = this;

      // 3. Registrar integraciones adaptadas como plugins del Kernel
      const { registerIntegrationsAsPlugins } = await import('./plugins/integration-plugin-adapter.js');
      await registerIntegrationsAsPlugins(this);

      _log.info('Kernel de JARVIS iniciado con éxito.');
      bus.emit('kernel:ready');
    } catch (e) {
      _log.error(`Error crítico al arrancar el Kernel: ${e.message}`);
      throw e;
    }
  }
};

// Exportar por defecto para carga dinámica
export default kernel;
