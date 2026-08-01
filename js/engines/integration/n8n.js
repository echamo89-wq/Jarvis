import { createLogger } from '../../utils/logger.js';
import { store } from '../../state/store.js';

const _log = createLogger('N8N');

function _loadConfig() {
  try {
    return JSON.parse(localStorage.getItem('jarvis_int_n8n') || '{}');
  } catch { return {}; }
}

async function _loadFullConfig() {
  const base = _loadConfig();
  if (window.electronAPI?.secureCredentialGet) {
    try {
      const secrets = await window.electronAPI.secureCredentialGet('int_n8n');
      if (secrets) Object.assign(base, secrets);
    } catch {}
  }
  return base;
}

function _saveConfig(config) {
  const save = {
    _configured: true,
    _lastTest: config._lastTest || Date.now(),
    apiUrl: config.apiUrl || 'http://localhost:5678',
    apiKey: config.apiKey ? '***' : ''
  };
  localStorage.setItem('jarvis_int_n8n', JSON.stringify(save));
  const secrets = {};
  if (config.apiKey) secrets.apiKey = config.apiKey;
  if (config.apiUrl) secrets.apiUrl = config.apiUrl;
  if (Object.keys(secrets).length > 0 && window.electronAPI?.secureCredentialSet) {
    window.electronAPI.secureCredentialSet('int_n8n', secrets).catch(() => {});
  }
}

// ─── Generador experto de flujos n8n ─────────────────────────────────────────
// Biblioteca de plantillas de nodos n8n más usados
function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const NODE_TEMPLATES = {
  // Triggers
  manualTrigger: (pos) => ({
    parameters: {},
    id: _uuid(),
    name: "Inicio Manual",
    type: "n8n-nodes-base.manualTrigger",
    typeVersion: 1,
    position: pos || [250, 300]
  }),

  scheduleTrigger: (cron, pos) => ({
    parameters: {
      rule: {
        interval: [{ field: "cronExpression", expression: cron || "0 9 * * 1-5" }]
      }
    },
    id: _uuid(),
    name: "Programador",
    type: "n8n-nodes-base.scheduleTrigger",
    typeVersion: 1,
    position: pos || [250, 300]
  }),

  webhookTrigger: (path, method, pos) => ({
    parameters: {
      path: path || "webhook",
      httpMethod: method || "POST",
      responseMode: "lastNode"
    },
    id: _uuid(),
    name: "Webhook",
    type: "n8n-nodes-base.webhook",
    typeVersion: 1,
    position: pos || [250, 300]
  }),

  emailReadTrigger: (folder, pos) => ({
    parameters: {
      mailbox: folder || "INBOX",
      action: "read"
    },
    id: _uuid(),
    name: "Leer Emails",
    type: "n8n-nodes-base.emailReadImap",
    typeVersion: 2,
    position: pos || [250, 300]
  }),

  // Procesamiento
  codeNode: (code, pos) => ({
    parameters: {
      jsCode: code || `// Lógica del flujo
const items = $input.all();
const result = items.map(item => ({
  json: {
    ...item.json,
    procesado: true,
    timestamp: new Date().toISOString()
  }
}));
return result;`
    },
    id: _uuid(),
    name: "Código JavaScript",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: pos || [450, 300]
  }),

  setNode: (values, pos) => ({
    parameters: {
      mode: "manual",
      duplicateItem: false,
      assignments: {
        assignments: (values || [{ name: 'resultado', value: '={{ $json.data }}', type: 'string' }]).map(v => ({
          id: _uuid(),
          name: v.name,
          value: v.value,
          type: v.type || 'string'
        }))
      }
    },
    id: _uuid(),
    name: "Asignar Variables",
    type: "n8n-nodes-base.set",
    typeVersion: 3,
    position: pos || [650, 300]
  }),

  ifNode: (condition, pos) => ({
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            id: _uuid(),
            leftValue: condition?.left || "={{ $json.status }}",
            rightValue: condition?.right || "success",
            operator: { type: "string", operation: "equals" }
          }
        ],
        combinator: "and"
      }
    },
    id: _uuid(),
    name: "Condición",
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position: pos || [650, 300]
  }),

  httpRequest: (url, method, body, pos) => ({
    parameters: {
      method: method || "GET",
      url: url || "https://api.ejemplo.com/endpoint",
      sendHeaders: false,
      sendBody: !!body,
      ...(body ? {
        bodyParameters: {
          parameters: [{ name: "data", value: JSON.stringify(body) }]
        }
      } : {}),
      options: { timeout: 10000, redirect: { redirect: {} } }
    },
    id: _uuid(),
    name: "Petición HTTP",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4,
    position: pos || [450, 300]
  }),

  emailSend: (to, subject, body, pos) => ({
    parameters: {
      fromEmail: "jarvis@tudominio.com",
      toEmail: to || "={{ $json.email }}",
      subject: subject || "Notificación automática de Jarvis",
      text: body || "={{ $json.mensaje }}",
      options: {}
    },
    id: _uuid(),
    name: "Enviar Email",
    type: "n8n-nodes-base.emailSend",
    typeVersion: 2,
    position: pos || [850, 300]
  }),

  slack: (channel, message, pos) => ({
    parameters: {
      authentication: "oAuth2",
      resource: "message",
      operation: "post",
      channel: { __rl: true, value: channel || "C01234567", mode: "id" },
      text: message || "={{ $json.mensaje }}",
      otherOptions: {}
    },
    id: _uuid(),
    name: "Mensaje Slack",
    type: "n8n-nodes-base.slack",
    typeVersion: 2,
    position: pos || [850, 300]
  }),

  telegram: (chatId, message, pos) => ({
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: chatId || "={{ $json.chat_id }}",
      text: message || "={{ $json.texto }}",
      additionalFields: {}
    },
    id: _uuid(),
    name: "Mensaje Telegram",
    type: "n8n-nodes-base.telegram",
    typeVersion: 1,
    position: pos || [850, 300]
  }),

  googleSheets: (action, spreadsheetId, range, pos) => ({
    parameters: {
      resource: "spreadsheet",
      operation: action || "read",
      documentId: { __rl: true, value: spreadsheetId || "", mode: "id" },
      sheetName: { __rl: true, value: range || "Hoja1", mode: "name" }
    },
    id: _uuid(),
    name: "Google Sheets",
    type: "n8n-nodes-base.googleSheets",
    typeVersion: 4,
    position: pos || [650, 300]
  }),

  airtable: (action, pos) => ({
    parameters: {
      resource: "record",
      operation: action || "list",
      application: { __rl: true, value: "", mode: "id" },
      table: { __rl: true, value: "", mode: "id" }
    },
    id: _uuid(),
    name: "Airtable",
    type: "n8n-nodes-base.airtable",
    typeVersion: 2,
    position: pos || [650, 300]
  }),

  splitInBatches: (batchSize, pos) => ({
    parameters: {
      batchSize: batchSize || 10,
      options: {}
    },
    id: _uuid(),
    name: "Dividir en Lotes",
    type: "n8n-nodes-base.splitInBatches",
    typeVersion: 3,
    position: pos || [650, 300]
  }),

  wait: (amount, unit, pos) => ({
    parameters: {
      resume: "timeInterval",
      amount: amount || 1,
      unit: unit || "hours"
    },
    id: _uuid(),
    name: "Esperar",
    type: "n8n-nodes-base.wait",
    typeVersion: 1,
    position: pos || [650, 300]
  }),

  noOp: (pos) => ({
    parameters: {},
    id: _uuid(),
    name: "Sin Operación",
    type: "n8n-nodes-base.noOp",
    typeVersion: 1,
    position: pos || [850, 500]
  }),

  merge: (mode, pos) => ({
    parameters: {
      mode: mode || "combine",
      combinationMode: "mergeByPosition"
    },
    id: _uuid(),
    name: "Fusionar Datos",
    type: "n8n-nodes-base.merge",
    typeVersion: 2,
    position: pos || [850, 300]
  }),

  aggregate: (pos) => ({
    parameters: {
      aggregate: "aggregateAllItemData",
      destinationFieldName: "data",
      options: {}
    },
    id: _uuid(),
    name: "Agregar Datos",
    type: "n8n-nodes-base.aggregate",
    typeVersion: 1,
    position: pos || [850, 300]
  }),

  stickyNote: (content, color, pos) => ({
    parameters: {
      content: content || "📝 Flujo generado por JARVIS",
      height: 100,
      width: 300,
      color: color || 1
    },
    id: _uuid(),
    name: "Nota",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: pos || [250, 150]
  })
};

// ─── Analizador inteligente de descripción → estructura de flujo ──────────────
function _analyzeDescription(description, nodesDesc) {
  const desc = (description + ' ' + (nodesDesc || '')).toLowerCase();

  const structure = {
    trigger: 'manual',
    nodes: [],
    hasCondition: false,
    hasLoop: false,
    hasEmail: false,
    hasSlack: false,
    hasTelegram: false,
    hasWebhook: false,
    hasHttp: false,
    hasSheets: false,
    hasSchedule: false,
    hasWait: false,
    cron: '0 9 * * 1-5'
  };

  // Detectar trigger
  if (/webhook|http\s*post|llamada\s*externa|api\s*entrada/.test(desc)) structure.trigger = 'webhook';
  else if (/cada\s*(hora|día|semana|lunes|mañana|noche|minuto)|programad|cron|schedule|automático/.test(desc)) structure.trigger = 'schedule';
  else if (/email|correo/.test(desc) && /recib|llegue|nuevo/.test(desc)) structure.trigger = 'email';

  // Detectar horario
  if (/cada\s*hora/.test(desc)) structure.cron = '0 * * * *';
  else if (/cada\s*día|diario|daily/.test(desc)) structure.cron = '0 9 * * *';
  else if (/cada\s*semana|semanal/.test(desc)) structure.cron = '0 9 * * 1';
  else if (/cada\s*lunes/.test(desc)) structure.cron = '0 9 * * 1';
  else if (/cada\s*minuto/.test(desc)) structure.cron = '* * * * *';
  else if (/cada\s*(\d+)\s*minutos?/.test(desc)) {
    const m = desc.match(/cada\s*(\d+)\s*minutos?/);
    structure.cron = `*/${m[1]} * * * *`;
  }

  // Detectar capacidades
  if (/condici[oó]n|si\s|si\s+.*(mayor|menor|igual|error|falla)|if\s/.test(desc)) structure.hasCondition = true;
  if (/loop|bucle|repet|cada\s+elemento|lote|batch/.test(desc)) structure.hasLoop = true;
  if (/email|correo|smtp|mail/.test(desc)) structure.hasEmail = true;
  if (/slack/.test(desc)) structure.hasSlack = true;
  if (/telegram/.test(desc)) structure.hasTelegram = true;
  if (/webhook|http|api|url|fetch|request/.test(desc)) structure.hasHttp = true;
  if (/sheets?|excel|hoja\s+de\s+cálculo|spreadsheet/.test(desc)) structure.hasSheets = true;
  if (/esperar?|wait|retraso|delay/.test(desc)) structure.hasWait = true;

  return structure;
}

// ─── Constructor experto de flujos ────────────────────────────────────────────
function _buildExpertWorkflow(name, description, nodesDesc) {
  const s = _analyzeDescription(description, nodesDesc);
  const nodes = [];
  const connections = {};
  let x = 250, y = 300;
  const step = 220;

  // Nota descriptiva (sticky)
  const note = NODE_TEMPLATES.stickyNote(
    `**${name}**\n📋 ${description.substring(0, 150)}\n\n⚡ Generado por JARVIS IA`,
    3,
    [x, y - 180]
  );
  nodes.push(note);

  // Trigger
  let triggerNode;
  if (s.trigger === 'webhook') {
    triggerNode = NODE_TEMPLATES.webhookTrigger('jarvis-webhook', 'POST', [x, y]);
  } else if (s.trigger === 'schedule') {
    triggerNode = NODE_TEMPLATES.scheduleTrigger(s.cron, [x, y]);
  } else if (s.trigger === 'email') {
    triggerNode = NODE_TEMPLATES.emailReadTrigger('INBOX', [x, y]);
  } else {
    triggerNode = NODE_TEMPLATES.manualTrigger([x, y]);
  }
  nodes.push(triggerNode);
  let prevNodeName = triggerNode.name;
  x += step;

  // HTTP Request si necesario
  if (s.hasHttp) {
    const httpNode = NODE_TEMPLATES.httpRequest(
      'https://api.ejemplo.com/datos',
      'GET',
      null,
      [x, y]
    );
    nodes.push(httpNode);
    connections[prevNodeName] = { main: [[{ node: httpNode.name, type: 'main', index: 0 }]] };
    prevNodeName = httpNode.name;
    x += step;
  }

  // Google Sheets si necesario
  if (s.hasSheets) {
    const sheetsNode = NODE_TEMPLATES.googleSheets('read', '', 'Hoja1', [x, y]);
    nodes.push(sheetsNode);
    connections[prevNodeName] = { main: [[{ node: sheetsNode.name, type: 'main', index: 0 }]] };
    prevNodeName = sheetsNode.name;
    x += step;
  }

  // Loop si necesario
  if (s.hasLoop) {
    const batchNode = NODE_TEMPLATES.splitInBatches(10, [x, y]);
    nodes.push(batchNode);
    connections[prevNodeName] = { main: [[{ node: batchNode.name, type: 'main', index: 0 }]] };
    prevNodeName = batchNode.name;
    x += step;
  }

  // Nodo de código principal (lógica de negocio)
  const mainLogic = `// ────────────────────────────────────────────
// Flujo: ${name}
// Propósito: ${description.substring(0, 100)}
// ────────────────────────────────────────────
const items = $input.all();

const procesados = items.map((item, idx) => {
  const data = item.json;

  // 🔧 LÓGICA PRINCIPAL DEL FLUJO
  // Modifica esta sección según tus necesidades
  const resultado = {
    indice: idx,
    datos_originales: data,
    procesado: true,
    timestamp: new Date().toISOString(),
    estado: 'completado',
    // Agrega tus campos calculados aquí
  };

  return { json: resultado };
});

// Retornar items procesados
return procesados;`;

  const codeNode = NODE_TEMPLATES.codeNode(mainLogic, [x, y]);
  nodes.push(codeNode);
  connections[prevNodeName] = { main: [[{ node: codeNode.name, type: 'main', index: 0 }]] };
  prevNodeName = codeNode.name;
  x += step;

  // Wait si necesario
  if (s.hasWait) {
    const waitNode = NODE_TEMPLATES.wait(1, 'hours', [x, y]);
    nodes.push(waitNode);
    connections[prevNodeName] = { main: [[{ node: waitNode.name, type: 'main', index: 0 }]] };
    prevNodeName = waitNode.name;
    x += step;
  }

  // Condición (ramificación)
  if (s.hasCondition) {
    const ifNode = NODE_TEMPLATES.ifNode(
      { left: '={{ $json.estado }}', right: 'completado' },
      [x, y]
    );
    nodes.push(ifNode);
    connections[prevNodeName] = { main: [[{ node: ifNode.name, type: 'main', index: 0 }]] };

    // Rama TRUE
    let trueX = x + step, trueY = y - 100;
    let truePrev = ifNode.name;
    let trueBranch = 0;

    // Rama FALSE (error)
    const noOpNode = NODE_TEMPLATES.noOp([x + step, y + 100]);
    noOpNode.name = 'Sin Acción (Error)';
    nodes.push(noOpNode);
    connections[ifNode.name] = {
      main: [
        [], // true branch (se conecta abajo)
        [{ node: noOpNode.name, type: 'main', index: 0 }] // false branch
      ]
    };

    // Notificaciones en rama TRUE
    if (s.hasEmail) {
      const emailNode = NODE_TEMPLATES.emailSend(
        'destinatario@ejemplo.com',
        `✅ ${name} completado`,
        '={{ JSON.stringify($json, null, 2) }}',
        [trueX, trueY]
      );
      nodes.push(emailNode);
      connections[ifNode.name].main[0] = [{ node: emailNode.name, type: 'main', index: 0 }];
      prevNodeName = emailNode.name;
      trueX += step;
    }

    if (s.hasSlack) {
      const slackNode = NODE_TEMPLATES.slack(
        'general',
        `✅ *${name}* completado\n> {{ JSON.stringify($json).substring(0, 200) }}`,
        [trueX, trueY]
      );
      nodes.push(slackNode);
      if (!connections[ifNode.name].main[0].length && !s.hasEmail) {
        connections[ifNode.name].main[0] = [{ node: slackNode.name, type: 'main', index: 0 }];
      }
    }

    if (s.hasTelegram) {
      const tgNode = NODE_TEMPLATES.telegram(
        '',
        `✅ ${name} completado\n\n{{ JSON.stringify($json).substring(0, 500) }}`,
        [trueX, trueY]
      );
      nodes.push(tgNode);
      if (!connections[ifNode.name].main[0].length) {
        connections[ifNode.name].main[0] = [{ node: tgNode.name, type: 'main', index: 0 }];
      }
    }

    if (!connections[ifNode.name].main[0].length) {
      const finalNoOp = NODE_TEMPLATES.noOp([trueX, trueY]);
      finalNoOp.name = 'Éxito';
      nodes.push(finalNoOp);
      connections[ifNode.name].main[0] = [{ node: finalNoOp.name, type: 'main', index: 0 }];
    }

  } else {
    // Sin condición — notificaciones directas
    if (s.hasEmail) {
      const emailNode = NODE_TEMPLATES.emailSend(
        'destinatario@ejemplo.com',
        `📋 ${name} - Reporte`,
        '={{ JSON.stringify($json, null, 2) }}',
        [x, y]
      );
      nodes.push(emailNode);
      connections[prevNodeName] = { main: [[{ node: emailNode.name, type: 'main', index: 0 }]] };
      prevNodeName = emailNode.name;
      x += step;
    }

    if (s.hasSlack) {
      const slackNode = NODE_TEMPLATES.slack(
        'general',
        `📋 *${name}* ejecutado\n> {{ JSON.stringify($json).substring(0, 300) }}`,
        [x, y]
      );
      nodes.push(slackNode);
      connections[prevNodeName] = { main: [[{ node: slackNode.name, type: 'main', index: 0 }]] };
      prevNodeName = slackNode.name;
      x += step;
    }

    if (s.hasTelegram) {
      const tgNode = NODE_TEMPLATES.telegram(
        '',
        `📋 ${name} ejecutado\n\n{{ JSON.stringify($json).substring(0, 500) }}`,
        [x, y]
      );
      nodes.push(tgNode);
      connections[prevNodeName] = { main: [[{ node: tgNode.name, type: 'main', index: 0 }]] };
      x += step;
    }
  }

  return {
    name,
    nodes,
    connections,
    settings: {
      executionTimeout: 3600,
      errorWorkflow: '',
      saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner'
    },
    staticData: null,
    meta: { templateCredsSetupCompleted: true },
    tags: [{ name: 'JARVIS' }]
  };
}

// ─── Módulo de integración n8n ────────────────────────────────────────────────
export const n8nIntegration = {
  id: 'n8n',
  name: 'n8n',
  icon: '🔀',
  description: 'Crea, importa y administra flujos de trabajo autónomos y automatizaciones profesionales en n8n.',
  guideSteps: [
    '1. Abre tu instancia de n8n (local en http://localhost:5678 o nube).',
    '2. Ve a Configuración → API de n8n y genera una nueva Clave de API.',
    '3. Copia la URL de tu n8n y la Clave de API, pégalas abajo y haz clic en "Probar".',
    '4. ¡Listo! Jarvis ahora puede generar y publicar flujos directamente en tu n8n.'
  ],
  authUrl: 'http://localhost:5678',
  _status: 'disconnected',

  configFields: [
    { key: 'apiUrl', label: 'URL del API', type: 'text', placeholder: 'http://localhost:5678/api/v1' },
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'n8n_api_...' }
  ],

  async testConnection(config) {
    const full = await _loadFullConfig();
    const c = { ...full, ...config };
    if (config.apiKey === '***') c.apiKey = full.apiKey;

    const url = c.apiUrl || 'http://localhost:5678/api/v1';
    const cleanUrl = url.endsWith('/v1') ? url : `${url.replace(/\/$/, '')}/api/v1`;

    if (!c.apiKey) {
      return { success: false, error: 'Se requiere una API Key para validar.' };
    }

    try {
      const res = await fetch(`${cleanUrl}/workflows?limit=1`, {
        headers: { 'X-N8N-API-KEY': c.apiKey }
      });
      if (res.ok) {
        c.apiUrl = cleanUrl;
        _saveConfig(c);
        return { success: true };
      }
      const text = await res.text();
      return { success: false, error: `Error de n8n (${res.status}): ${text}` };
    } catch (e) {
      return { success: false, error: `No se pudo conectar a n8n: ${e.message}` };
    }
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'n8n_generate_workflow',
        description: 'Genera el JSON completo y profesional de un flujo n8n con nodos reales (triggers, HTTP, email, Slack, Telegram, Google Sheets, código JS, condiciones, bucles). Analiza los requerimientos y construye la arquitectura óptima.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nombre descriptivo del flujo de automatización.' },
            description: { type: 'string', description: 'Descripción detallada del objetivo del flujo y qué debe hacer.' },
            nodes_description: { type: 'string', description: 'Instrucciones específicas sobre el comportamiento de cada nodo, fuentes de datos, condiciones y destinos.' }
          },
          required: ['name', 'description']
        }
      },
      {
        name: 'n8n_publish_workflow',
        description: 'Publica un flujo JSON generado directamente en la instancia conectada de n8n.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nombre del flujo' },
            workflow_json: { type: 'string', description: 'JSON válido del flujo generado para n8n.' }
          },
          required: ['name', 'workflow_json']
        }
      },
      {
        name: 'n8n_list_workflows',
        description: 'Lista todos los flujos existentes en n8n con su estado (activo/inactivo) e información básica.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Número máximo de flujos a mostrar (default: 20)' }
          },
          required: []
        }
      }
    ];
  },

  async executeTool(name, args, config) {
    if (name === 'n8n_generate_workflow') {
      const workflow = _buildExpertWorkflow(
        args.name || 'Flujo Jarvis',
        args.description || '',
        args.nodes_description || ''
      );

      const workflowJson = JSON.stringify(workflow, null, 2);
      const fileName = `n8n_${(args.name || 'flujo').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;

      // Guardar en Documentos del usuario
      const homeDir = store.get('homeDir') || '';
      const filePath = homeDir
        ? `${homeDir}\\Documents\\${fileName}`
        : fileName;

      if (filePath && homeDir && window.electronAPI?.fileWrite) {
        try {
          await window.electronAPI.fileWrite(filePath, workflowJson);
        } catch (e) {
          _log('warn', `No se pudo guardar archivo JSON: ${e.message}`);
        }
      }

      const nodeCount = workflow.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote').length;
      const triggerType = workflow.nodes[1]?.type?.split('.').pop() || 'manualTrigger';
      const triggerName = {
        manualTrigger: 'Manual',
        scheduleTrigger: 'Programado',
        webhook: 'Webhook',
        emailReadImap: 'Email'
      }[triggerType] || 'Manual';

      return {
        success: true,
        output: [
          `Flujo "${args.name}" generado con arquitectura profesional.`,
          ``,
          `📊 Estructura del flujo:`,
          `  • Nodos: ${nodeCount}`,
          `  • Trigger: ${triggerName}`,
          `  • Capacidades detectadas: ${[
            workflow.nodes.some(n => n.type.includes('httpRequest')) ? 'HTTP/API' : '',
            workflow.nodes.some(n => n.type.includes('emailSend')) ? 'Email' : '',
            workflow.nodes.some(n => n.type.includes('slack')) ? 'Slack' : '',
            workflow.nodes.some(n => n.type.includes('telegram')) ? 'Telegram' : '',
            workflow.nodes.some(n => n.type.includes('googleSheets')) ? 'Google Sheets' : '',
            workflow.nodes.some(n => n.type.includes('if')) ? 'Condiciones' : '',
            workflow.nodes.some(n => n.type.includes('splitInBatches')) ? 'Bucles' : '',
          ].filter(Boolean).join(', ') || 'Código personalizado'}`,
          ``,
          `📁 Archivo guardado: ${filePath || fileName}`,
          ``,
          `Para importarlo en n8n: Workflows → Import from file → selecciona el archivo.`,
          ``,
          `JSON del flujo:\n\`\`\`json\n${workflowJson.substring(0, 3000)}${workflowJson.length > 3000 ? '\n... (truncado — ver archivo completo)' : ''}\n\`\`\``
        ].join('\n')
      };
    }

    if (name === 'n8n_list_workflows') {
      const cleanUrl = config.apiUrl || 'http://localhost:5678/api/v1';
      try {
        const res = await fetch(`${cleanUrl}/workflows?limit=${args.limit || 20}`, {
          headers: { 'X-N8N-API-KEY': config.apiKey }
        });
        if (!res.ok) return { success: false, output: `Error al listar flujos: ${res.status}` };
        const data = await res.json();
        const flows = data.data || [];
        if (!flows.length) return { success: true, output: 'No hay flujos en tu instancia de n8n.' };
        const lines = flows.map((f, i) =>
          `${i + 1}. ${f.active ? '🟢' : '⚪'} **${f.name}** (ID: ${f.id}) — ${f.active ? 'Activo' : 'Inactivo'}`
        );
        return {
          success: true,
          output: `Flujos en n8n (${flows.length}):\n\n${lines.join('\n')}`
        };
      } catch (e) {
        return { success: false, output: `Error de conexión: ${e.message}` };
      }
    }

    if (name === 'n8n_publish_workflow') {
      const cleanUrl = config.apiUrl || 'http://localhost:5678/api/v1';
      try {
        let parsed;
        try {
          parsed = typeof args.workflow_json === 'string' ? JSON.parse(args.workflow_json) : args.workflow_json;
        } catch {
          return { success: false, output: 'El JSON del flujo de n8n no es válido.' };
        }

        const res = await fetch(`${cleanUrl}/workflows`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': config.apiKey
          },
          body: JSON.stringify({
            name: args.name || parsed.name || 'Flujo importado por Jarvis',
            nodes: parsed.nodes || [],
            connections: parsed.connections || {},
            settings: parsed.settings || { executionTimeout: 3600 },
            active: false
          })
        });

        if (res.ok) {
          const data = await res.json();
          return {
            success: true,
            output: `✅ Flujo "${args.name}" publicado exitosamente en n8n.\nID: ${data.id}\nPuedes abrirlo en tu n8n para activarlo y configurar las credenciales.`
          };
        }
        const text = await res.text();
        return { success: false, output: `Error al publicar flujo en n8n: ${text}` };
      } catch (err) {
        return { success: false, output: `Error de conexión al publicar: ${err.message}` };
      }
    }

    return { success: false, output: 'Herramienta no implementada.' };
  }
};
