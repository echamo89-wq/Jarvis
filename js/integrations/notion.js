import { createLogger } from '../utils/logger.js';
const _log = createLogger('NOTION');

export const notionIntegration = {
  id: 'notion',
  name: 'Notion',
  icon: '◈',
  description: 'Accede a tu espacio de trabajo de Notion: listar y buscar páginas, crear contenido. Necesitas un Internal Integration Token de notion.so/my-integrations.',
  guideSteps: [
    '1. Ve a notion.so/my-integrations e inicia sesión con tu cuenta de Notion.',
    '2. Haz clic en "New integration", asígnale un nombre y elige el workspace.',
    '3. En la configuración de la integración, copia el "Internal Integration Token" (empieza con ntn_).',
    '4. Comparte una página de Notion con la integración desde los ajustes de la página (Share → Invite).',
    '5. Pega el token abajo (y opcionalmente el ID de página padre) y prueba la conexión.'
  ],
  authUrl: 'https://www.notion.so/my-integrations',
  _status: 'disconnected',

  configFields: [
    { key: 'apiToken', label: 'Internal Integration Token', type: 'password', placeholder: 'ntn_...' },
    { key: 'parentPageId', label: 'ID de página padre (opcional)', type: 'text', placeholder: '1a2b3c4d5e6f...' }
  ],

  async testConnection(config) {
    if (!config.apiToken || !config.apiToken.startsWith('ntn_')) {
      return { success: false, error: 'Token de API de Notion inválido. Debe empezar con "ntn_".' };
    }
    try {
      const res = await fetch('https://api.notion.com/v1/users/me', {
        headers: { 'Authorization': `Bearer ${config.apiToken}`, 'Notion-Version': '2022-06-28' }
      });
      if (res.status === 401) return { success: false, error: 'Token inválido o revocado.' };
      if (!res.ok) return { success: false, error: `Error HTTP ${res.status}` };
      const data = await res.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: `Error de red: ${e.message}` };
    }
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'notion_search',
        description: 'Busca páginas y bases de datos en Notion.',
        parameters: { type: 'object', properties: {
          query: { type: 'string', description: 'Término de búsqueda' },
          limit: { type: 'integer', description: 'Máx resultados (default: 10)' }
        }, required: ['query'] }
      },
      {
        name: 'notion_create_page',
        description: 'Crea una nueva página en Notion con contenido en texto.',
        parameters: { type: 'object', properties: {
          title: { type: 'string', description: 'Título de la página' },
          content: { type: 'string', description: 'Contenido de la página en texto plano' }
        }, required: ['title', 'content'] }
      }
    ];
  },

  async executeTool(name, args, config) {
    const headers = { 'Authorization': `Bearer ${config.apiToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

    switch (name) {
      case 'notion_search': {
        const limit = Math.min(args.limit || 10, 50);
        const res = await fetch('https://api.notion.com/v1/search', {
          method: 'POST', headers,
          body: JSON.stringify({ query: args.query, page_size: limit })
        });
        if (!res.ok) return { success: false, output: `Error Notion: HTTP ${res.status}` };
        const data = await res.json();
        const pages = data.results || [];
        if (pages.length === 0) return { success: true, output: 'Sin resultados en Notion.' };
        const lines = pages.map(p => `📄 ${p.object}: ${p.title?.[0]?.plain_text || 'Sin título'} (ID: ${p.id})`);
        return { success: true, output: `Resultados para "${args.query}":\n${lines.join('\n')}` };
      }

      case 'notion_create_page': {
        const parentId = config.parentPageId;
        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers,
          body: JSON.stringify({
            parent: parentId ? { page_id: parentId } : { workspace: true },
            properties: { title: { title: [{ text: { content: args.title } }] } },
            children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: args.content } }] } }]
          })
        });
        if (!res.ok) return { success: false, output: `Error Notion: HTTP ${res.status}` };
        const data = await res.json();
        return { success: true, output: `✅ Página creada en Notion: "${args.title}" (ID: ${data.id})` };
      }

      default:
        return { success: false, output: `Tool "${name}" no implementada.` };
    }
  }
};
