/**
 * Adaptador de Integraciones como Plugins de Kernel.
 * Permite que todas las integraciones (Google, Spotify, Notion, Slack, Telegram, Discord, etc.)
 * se registren automáticamente y de manera limpia en el Plugin Manager central del Kernel.
 */

import { pluginManager } from '../plugin-manager.js';
import { getAllIntegrations, executeIntegrationTool, getIntegrationConfig } from '../../engines/integration/index.js';

export async function registerIntegrationsAsPlugins(kernel) {
  const integrations = getAllIntegrations();

  for (const int of integrations) {
    // Solo registrar si está configurada por el usuario
    const config = getIntegrationConfig(int.id);
    const isConfigured = config._configured === true;

    const pluginContract = {
      manifest: {
        name: `integration:${int.id}`,
        version: '1.0.0',
        description: `Plugin de integración para ${int.name}`,
        permissions: ['network'],
        configured: isConfigured
      },

      async init(k) {
        // Enlazar estado
        int._status = isConfigured ? 'connected' : 'disconnected';
      },

      async destroy() {
        int._status = 'disconnected';
      },

      // Exponer herramientas del plugin directamente al LLM
      tools: typeof int.getFunctionDeclarations === 'function' ? int.getFunctionDeclarations() : []
    };

    // Registrar en el Plugin Manager
    await pluginManager.register(pluginContract);
  }
}
