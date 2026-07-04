import { createLogger } from '../utils/logger.js';
const _log = createLogger('TELEGRAM');

export const telegramIntegration = {
  id: 'telegram',
  name: 'Telegram',
  icon: '✈',
  description: 'Envía y recibe mensajes de Telegram usando un Bot Token de @BotFather.',
  guideSteps: [
    '1. Abre Telegram y busca @BotFather (el bot oficial para crear bots).',
    '2. Envía el comando /newbot y sigue las instrucciones para elegir nombre y username.',
    '3. @BotFather te dará un token HTTP API (formato 123456:ABC-DEF...). Cópialo.',
    '4. Opcional: para obtener tu Chat ID, envía un mensaje a @userinfobot o usa getUpdates.',
    '5. Pega el token abajo y haz clic en "Probar conexión" para verificar.'
  ],
  authUrl: 'https://t.me/BotFather',
  _status: 'disconnected',

  configFields: [
    { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF...' },
    { key: 'chatId', label: 'Chat ID (opcional, predeterminado)', type: 'text', placeholder: '-1001234567890' }
  ],

  async testConnection(config) {
    if (!config.botToken || !config.botToken.includes(':')) {
      return { success: false, error: 'Bot Token inválido. Consíguelo en @BotFather.' };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`);
      if (!res.ok) return { success: false, error: `Error HTTP ${res.status}. Token inválido?` };
      const data = await res.json();
      if (!data.ok) return { success: false, error: data.description || 'Error desconocido' };
      return { success: true, data: { bot: data.result.username } };
    } catch (e) {
      return { success: false, error: `Error de red: ${e.message}` };
    }
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'telegram_send_message',
        description: 'Envía un mensaje de texto a un chat de Telegram.',
        parameters: { type: 'object', properties: {
          text: { type: 'string', description: 'Texto del mensaje' },
          chat_id: { type: 'string', description: 'Chat ID opcional (usa el configurado por defecto)' }
        }, required: ['text'] }
      },
      {
        name: 'telegram_get_updates',
        description: 'Obtiene los últimos mensajes recibidos por el bot.',
        parameters: { type: 'object', properties: {
          limit: { type: 'integer', description: 'Máx mensajes (default: 10)' }
        }, required: [] }
      }
    ];
  },

  async executeTool(name, args, config) {
    const base = `https://api.telegram.org/bot${config.botToken}`;

    switch (name) {
      case 'telegram_send_message': {
        const chatId = args.chat_id || config.chatId;
        if (!chatId) return { success: false, output: 'Chat ID no configurado. Pásalo como argumento o configúralo en Integraciones.' };
        const res = await fetch(`${base}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: args.text })
        });
        const data = await res.json();
        if (!data.ok) return { success: false, output: `Error Telegram: ${data.description || 'HTTP ' + res.status}` };
        return { success: true, output: 'Mensaje enviado a Telegram correctamente.' };
      }

      case 'telegram_get_updates': {
        const limit = Math.min(args.limit || 10, 50);
        const res = await fetch(`${base}/getUpdates?limit=${limit}`);
        const data = await res.json();
        if (!data.ok) return { success: false, output: `Error Telegram: ${data.description || 'HTTP ' + res.status}` };
        const messages = (data.result || []).map(u => {
          const msg = u.message || u.edited_message || {};
          return `📨 De: ${msg.from?.first_name || 'desconocido'} (${msg.from?.id || '?'}): ${msg.text || '(sin texto)'}`;
        });
        if (messages.length === 0) return { success: true, output: 'No hay mensajes recientes.' };
        return { success: true, output: `Últimos mensajes:\n${messages.join('\n')}` };
      }

      default:
        return { success: false, output: `Tool "${name}" no implementada.` };
    }
  }
};
