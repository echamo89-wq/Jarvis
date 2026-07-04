import { createLogger } from '../utils/logger.js';
const _log = createLogger('SLACK');

export const slackIntegration = {
  id: 'slack',
  name: 'Slack',
  icon: '#',
  description: 'Envía mensajes a canales de Slack mediante Webhooks entrantes.',
  guideSteps: [
    '1. Ve a api.slack.com/apps y crea una nueva app desde cero.',
    '2. Ve a "Incoming Webhooks" y activa el interruptor para habilitarlos.',
    '3. Haz clic en "Add New Webhook to Workspace" y selecciona el canal destino.',
    '4. Copia la URL del Webhook (https://hooks.slack.com/services/...) y pégala abajo.',
    '5. Haz clic en "Probar conexión" para confirmar que funciona.'
  ],
  authUrl: 'https://api.slack.com/apps',
  _status: 'disconnected',

  configFields: [
    { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/services/...' }
  ],

  async testConnection(config) {
    if (!config.webhookUrl || !config.webhookUrl.includes('hooks.slack.com')) {
      return { success: false, error: 'URL de Webhook de Slack inválida.' };
    }
    try {
      const res = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'JARVIS - Conexión exitosa ✅' })
      });
      if (!res.ok) return { success: false, error: `Error HTTP ${res.status}. Verifica la URL.` };
      return { success: true, data: { ok: true } };
    } catch (e) {
      return { success: false, error: `Error de red: ${e.message}` };
    }
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'slack_send_message',
        description: 'Envía un mensaje a un canal de Slack mediante webhook.',
        parameters: { type: 'object', properties: {
          text: { type: 'string', description: 'Texto del mensaje a enviar' },
          channel: { type: 'string', description: 'Nombre del canal (opcional, si el webhook lo permite)' }
        }, required: ['text'] }
      }
    ];
  },

  async executeTool(name, args, config) {
    if (name !== 'slack_send_message') return { success: false, output: `Tool "${name}" no implementada.` };
    const payload = { text: args.text };
    if (args.channel) payload.channel = args.channel;
    try {
      const res = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return { success: false, output: `Error Slack: HTTP ${res.status}` };
      return { success: true, output: 'Mensaje enviado a Slack correctamente.' };
    } catch (e) {
      return { success: false, output: `Error de red: ${e.message}` };
    }
  }
};
