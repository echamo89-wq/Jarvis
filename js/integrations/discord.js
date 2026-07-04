import { createLogger } from '../utils/logger.js';
const _log = createLogger('DISCORD');

export const discordIntegration = {
  id: 'discord',
  name: 'Discord (Webhooks)',
  icon: '◆',
  description: 'Envía alertas, notas rápidas, fragmentos de código o logs a un canal de Discord mediante Webhooks.',
  guideSteps: [
    '1. Ve a Discord Developer Portal y crea o selecciona tu aplicación.',
    '2. Ve a la sección "Integrations" del servidor donde quieres enviar mensajes.',
    '3. Haz clic en "Webhooks" → "New Webhook", asigna un nombre y canal.',
    '4. Copia la URL del Webhook (https://discord.com/api/webhooks/...) y pégala abajo.',
    '5. Haz clic en "Probar conexión" para verificar.'
  ],
  authUrl: 'https://discord.com/developers/applications',
  _status: 'disconnected',

  configFields: [
    { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' }
  ],

  async testConnection(config) {
    if (!config.webhookUrl || !config.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { success: false, error: 'URL del Webhook de Discord inválida.' };
    }
    try {
      const res = await fetch(config.webhookUrl);
      if (!res.ok) return { success: false, error: `Error HTTP ${res.status} al validar webhook.` };
      const data = await res.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: `Error de red: ${e.message}` };
    }
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'discord_send_message',
        description: 'Envía un mensaje o alerta a un canal de Discord configurado mediante webhook.',
        parameters: { type: 'object', properties: {
          content: { type: 'string', description: 'Cuerpo del mensaje (soporta markdown de Discord, menciones, emojis)' },
          username: { type: 'string', description: 'Nombre opcional del bot en el mensaje' },
          avatar_url: { type: 'string', description: 'URL opcional del avatar del bot' }
        }, required: ['content'] }
      }
    ];
  },

  async executeTool(name, args, config) {
    if (name !== 'discord_send_message') {
      return { success: false, output: `Herramienta "${name}" no soportada.` };
    }
    try {
      const body = {
        content: args.content
      };
      if (args.username) body.username = args.username;
      if (args.avatar_url) body.avatar_url = args.avatar_url;

      const res = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.status === 204 || res.ok) {
        return { success: true, output: '✅ Mensaje enviado a Discord con éxito.' };
      }
      const text = await res.text();
      return { success: false, output: `Error de Discord (${res.status}): ${text}` };
    } catch (e) {
      return { success: false, output: `Fallo al enviar a Discord: ${e.message}` };
    }
  }
};
