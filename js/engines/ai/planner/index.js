import { store } from '../../../state/store.js';
import { Planner } from './planner.js';
import { verifyStep } from './verifier.js';
import { Reflector } from './reflection.js';
import { scheduleReplan, cancelPlanTimers, getActiveTimers, clearAllTimers } from './scheduler.js';
import { createLogger } from '../../../utils/logger.js';
const _log = createLogger('PLANNER');

const planner = new Planner();
const reflector = new Reflector();
const AUTO_TOOLS = [
  'launch_app', 'execute_powershell', 'search_web', 'open_browser', 'fetch_url', 'file_operation', 'computer_action', 'set_volume', 'set_brightness', 'system_stats', 'list_processes', 'find_files', 'get_weather', 'get_news', 'get_sports_news', 'youtube_action', 'youtube_download', 'set_reminder', 'set_timer', 'show_notification', 'process_file', 'edit_video',
  'github_list_repos', 'github_search_repos', 'github_get_repo', 'github_create_issue', 'github_list_issues', 'github_list_pull_requests', 'github_create_repo', 'github_get_readme', 'github_search_code', 'github_delete_repo', 'github_update_repo', 'github_get_orgs', 'github_get_repo_contents', 'github_get_repo_commits', 'github_get_repo_contributors', 'github_get_user_events', 'github_get_repo_branches', 'github_get_repo_languages',
  'gmail_list_inbox', 'gmail_send_email', 'gmail_search', 'gmail_read_email', 'gmail_get_unread_count', 'gmail_trash_email', 'gmail_batch_trash', 'gmail_empty_trash',
  'calendar_list_events', 'calendar_create_event'
];

function _getToolList() {
  try {
    return store.get('_lastFunctionDeclarations') || AUTO_TOOLS;
  } catch { return AUTO_TOOLS; }
}

export function getFunctionDeclarations() {
  return [
    {
      name: 'planner_auto',
      description: `PLANIFICADOR AUTÓNOMO. Llama a esta herramienta CUANDO UNA SOLICITUD REQUIERA MÚLTIPLES PASOS. 
No ejecutes las herramientas manualmente — deja que el planificador las ejecute, verifique y se adapte.
El planificador:
1. Descompone la meta en pasos con dependencias y condiciones
2. Ejecuta cada paso automáticamente con la herramienta adecuada
3. Verifica que cada paso se completó correctamente
4. Si un paso falla, analiza el error, busca alternativas y reintenta
5. Si se queda sin reintentos, sugiere replanificar
6. Soporta ejecución diferida (programar pasos para más tarde)

Ejemplo: plan_start(goal: "Organizar escritorio", steps: ["Listar archivos", "Clasificar por tipo", "Crear carpetas", "Mover archivos"])
Ejemplo con dependencias: plan_start(goal: "Setup proyecto web", steps: [{desc: "Crear carpeta", dependsOn: []}, {desc: "Inicializar npm", dependsOn: ["step_1"]}, {desc: "Instalar dependencias", dependsOn: ["step_2"]}])`,
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Meta general' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                desc: { type: 'string', description: 'Descripción del paso' },
                dependsOn: { type: 'array', items: { type: 'string' }, description: 'IDs de pasos de los que depende. Opcional.' },
                condition: { type: 'string', description: 'Condición opcional (ej: "si existe el archivo"). Opcional.' },
                maxAttempts: { type: 'number', description: 'Máximo de reintentos (default 3). Opcional.' },
                tool: { type: 'string', description: 'Herramienta sugerida para ejecutar este paso. Opcional.' }
              },
              required: ['desc']
            }
          },
          deferMs: { type: 'number', description: 'Ejecutar el plan después de N milisegundos. Opcional.' }
        },
        required: ['goal', 'steps']
      }
    },
    {
      name: 'planner_status',
      description: 'CONSULTA EL ESTADO DEL PLAN EN EJECUCIÓN: progreso, paso actual, dependencias pendientes, historial de errores. Devuelve también si hay replanificación pendiente.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'planner_retry',
      description: 'REINTENTA UN PASO QUE FALLÓ. Útil después de que el planificador indique que un paso falló pero quedan reintentos.',
      parameters: {
        type: 'object',
        properties: {
          stepId: { type: 'string', description: 'ID del paso a reintentar' },
          newApproach: { type: 'string', description: 'Nuevo enfoque o cambios a aplicar. Opcional.' }
        },
        required: ['stepId']
      }
    },
    {
      name: 'planner_replan',
      description: 'REPLANIFICA DESPUÉS DE UN ERROR IRRECUPERABLE. Cancela el plan actual y permite definir uno nuevo con un enfoque diferente.',
      parameters: {
        type: 'object',
        properties: {
          newGoal: { type: 'string', description: 'Meta modificada o ajustada' },
          newSteps: { type: 'array', items: { type: 'object', properties: { desc: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } } }, required: ['desc'] } }
        },
        required: ['newGoal', 'newSteps']
      }
    },
    {
      name: 'planner_timers',
      description: 'LISTA LOS TEMPORIZADORES ACTIVOS. Muestra qué pasos o replanificaciones están programadas y cuánto falta para ejecutarse.',
      parameters: { type: 'object', properties: {} }
    }
  ];
}

export async function executeTool(name, args) {
  switch (name) {
    case 'planner_auto': {
      const { goal, steps, deferMs } = args || {};
      if (!goal || !steps || steps.length === 0) return JSON.stringify({ error: 'Se requiere goal y steps' });
      const result = planner.createPlan(goal, steps);
      store.set('_activePlan', planner.plan);
      if (deferMs > 0) {
        scheduleReplan(planner.plan.id, deferMs, () => {
          _log('info', `Plan diferido ejecutándose ahora: "${goal}"`);
        });
        return JSON.stringify({ ...result, deferred: true, executeIn: deferMs });
      }
      return JSON.stringify(result);
    }

    case 'planner_status': {
      const summary = planner.getSummary();
      if (!summary) return JSON.stringify({ active: false, message: 'No hay un plan activo' });
      const timers = getActiveTimers();
      const reflectionHistory = reflector.getHistory();
      return JSON.stringify({
        active: true,
        ...summary,
        steps: planner.plan?.steps.map(s => ({
          id: s.id, desc: s.desc, status: s.status, attempts: s.attempts, maxAttempts: s.maxAttempts,
          error: s.error, duration: s.duration, dependsOn: s.dependsOn, condition: s.condition
        })),
        timers,
        reflectionHistory: reflectionHistory.slice(-5)
      });
    }

    case 'planner_retry': {
      const { stepId, newApproach } = args || {};
      if (!stepId) return JSON.stringify({ error: 'stepId requerido' });
      const step = planner.getStep(stepId);
      if (!step) return JSON.stringify({ error: `Paso "${stepId}" no encontrado` });
      if (step.status !== 'failed' && step.status !== 'pending') {
        return JSON.stringify({ error: `Paso "${stepId}" está en estado "${step.status}", no se puede reintentar` });
      }
      if (step.attempts >= step.maxAttempts) {
        const reflection = reflector.suggestAlternate(stepId, step.desc, step.error || '', _getToolList());
        return JSON.stringify({
          error: `Máximo de reintentos alcanzado (${step.maxAttempts})`,
          reflection,
          suggestion: 'Usa planner_replan para crear un nuevo plan con enfoque diferente'
        });
      }
      step.status = 'pending';
      step.attempts++;
      step.error = null;
      step.startedAt = null;
      if (newApproach) step.desc = `${step.desc} (${newApproach})`;
      store.set('_activePlan', planner.plan);
      return JSON.stringify({ success: true, step: { id: step.id, desc: step.desc, attempt: step.attempts, maxAttempts: step.maxAttempts } });
    }

    case 'planner_replan': {
      const { newGoal, newSteps } = args || {};
      if (!newGoal || !newSteps || newSteps.length === 0) return JSON.stringify({ error: 'Se requiere newGoal y newSteps' });
      cancelPlanTimers(planner.plan?.id);
      const result = planner.createPlan(newGoal, newSteps);
      store.set('_activePlan', planner.plan);
      reflector.clearHistory();
      return JSON.stringify({ ...result, replanned: true, previousGoal: planner.plan?.goal });
    }

    case 'planner_timers': {
      const timers = getActiveTimers();
      return JSON.stringify({ active: timers.length, timers });
    }

    case 'plan_start': {
      const { goal, steps } = args || {};
      if (!goal || !steps || !Array.isArray(steps) || steps.length === 0) return JSON.stringify({ error: 'Se requiere goal (string) y steps (array no vacío)' });
      const result = planner.createPlan(goal, steps);
      store.set('_activePlan', planner.plan);
      return JSON.stringify(result);
    }

    case 'plan_step_complete': {
      const { stepId, result: stepResult } = args || {};
      if (!stepId) return JSON.stringify({ error: 'stepId requerido' });
      const outcome = planner.completeStep(stepId, stepResult || '');
      store.set('_activePlan', planner.plan);
      return JSON.stringify(outcome);
    }

    case 'plan_status': {
      const summary = planner.getSummary();
      if (!summary) return JSON.stringify({ active: false, message: 'No hay un plan activo' });
      return JSON.stringify({ active: true, ...summary });
    }

    default:
      return null;
  }
}

export async function runAutoPlan(goal, steps) {
  const result = planner.createPlan(goal, steps);
  store.set('_activePlan', planner.plan);
  let allCompleted = true;
  for (const step of planner.plan.steps) {
    if (step.status === 'done') continue;
    const startResult = planner.startStep(step.id);
    if (startResult.error) {
      _log('warn', `No se pudo iniciar ${step.id}: ${startResult.error}`);
      continue;
    }
    const toolName = step.tool || _inferTool(step.desc);
    if (!toolName) {
      planner.completeStep(step.id, 'Paso analítico — sin herramienta necesaria');
      continue;
    }
    _log('info', `Ejecutando paso "${step.desc}" con ${toolName}`);
    try {
      const { executeToolCall } = await import('../../../tools/executor.js');
      const toolResult = await executeToolCall([{ name: toolName, args: step.args || {} }]);
      const verification = await verifyStep(toolName, step.args || {}, toolResult);
      if (verification.passed) {
        planner.completeStep(step.id, verification.evidence || toolResult?.output || '');
      } else {
        reflector.addEvent(step.id, step.desc, verification.reason, step.attempts);
        const failResult = planner.failStep(step.id, verification.reason);
        if (!failResult.retry) {
          allCompleted = false;
          const reflection = reflector.suggestAlternate(step.id, step.desc, verification.reason, _getToolList());
          _log('warn', `Plan bloqueado en paso "${step.desc}". Análisis: ${reflection.analysis.patterns.join(', ')}`);
          return { status: 'blocked', step: step.desc, error: verification.reason, reflection };
        }
        step.status = 'in_progress';
        step.attempts++;
        step.startedAt = Date.now();
        step.error = null;
        const toolResult2 = await executeToolCall([{ name: toolName, args: step.args || {} }]);
        const verification2 = await verifyStep(toolName, step.args || {}, toolResult2);
        if (verification2.passed) {
          planner.completeStep(step.id, verification2.evidence || toolResult2?.output || '');
        } else {
          reflector.addEvent(step.id, step.desc, verification2.reason, step.attempts);
          planner.failStep(step.id, verification2.reason);
          allCompleted = false;
        }
      }
    } catch (err) {
      reflector.addEvent(step.id, step.desc, err.message, step.attempts);
      const failResult = planner.failStep(step.id, err.message);
      if (!failResult.retry) { allCompleted = false; break; }
    }
  }
  store.set('_activePlan', planner.plan);
  return {
    status: allCompleted ? 'completed' : planner.plan?.status || 'partial',
    summary: planner.getSummary(),
    reflectionLog: reflector.getHistory()
  };
}

function _inferTool(desc) {
  const d = desc.toLowerCase();
  if (d.includes('buscar') || d.includes('search') || d.includes('google') || d.includes('web')) return 'search_web';
  if (d.includes('abrir') || d.includes('lanzar') || d.includes('open') || d.includes('iniciar') || d.includes('chrome') || d.includes('navegador')) return 'launch_app';
  if (d.includes('archivo') || d.includes('file') || d.includes('crear carpeta') || d.includes('mover') || d.includes('copiar') || d.includes('eliminar') || d.includes('rename') || d.includes('borrar')) return 'file_operation';
  if (d.includes('powershell') || d.includes('comando') || d.includes('terminal') || d.includes('consola') || d.includes('script')) return 'execute_powershell';
  if (d.includes('clima') || d.includes('weather') || d.includes('temperatura')) return 'get_weather';
  if (d.includes('noticia') || d.includes('news')) return 'get_news';
  if (d.includes('deporte') || d.includes('futbol') || d.includes('nfl') || d.includes('nba') || d.includes('f1')) return 'get_sports_news';
  if (d.includes('youtube') || d.includes('video') || d.includes('descargar')) return 'youtube_download';
  if (d.includes('volumen') || d.includes('volume') || d.includes('sonido')) return 'set_volume';
  if (d.includes('brillo') || d.includes('brightness') || d.includes('pantalla')) return 'set_brightness';
  if (d.includes('notificar') || d.includes('notify') || d.includes('notification')) return 'show_notification';
  if (d.includes('temporizador') || d.includes('timer') || d.includes('recordatorio') || d.includes('alarma')) return 'set_timer';
  if (d.includes('proceso') || d.includes('procesos') || d.includes('task')) return 'list_processes';
  if (d.includes('sistema') || d.includes('system') || d.includes('rendimiento') || d.includes('ram') || d.includes('cpu') || d.includes('disco')) return 'system_stats';
  if (d.includes('buscar archivo') || d.includes('find file') || d.includes('localizar')) return 'find_files';
  
  // Inferencia para herramientas de integración
  if (d.includes('github') || d.includes('git hub') || d.includes('repositorio') || d.includes('repo')) {
    if (d.includes('buscar código') || d.includes('search code') || d.includes('buscar en código')) return 'github_search_code';
    if (d.includes('readme') || d.includes('leeme')) return 'github_get_readme';
    if (d.includes('contenido') || d.includes('ver carpeta') || d.includes('get contents')) return 'github_get_repo_contents';
    if (d.includes('listar') || d.includes('repos') || d.includes('list repos')) return 'github_list_repos';
    if (d.includes('issue') || d.includes('bug')) {
      if (d.includes('crear') || d.includes('create')) return 'github_create_issue';
      return 'github_list_issues';
    }
    if (d.includes('pull') || d.includes('pr')) return 'github_list_pull_requests';
    return 'github_search_repos';
  }
  if (d.includes('gmail') || d.includes('correo') || d.includes('email') || d.includes('inbox') || d.includes('mensaje')) {
    if (d.includes('buscar') || d.includes('search')) return 'gmail_search';
    if (d.includes('leer') || d.includes('read')) return 'gmail_read_email';
    if (d.includes('no leídos') || d.includes('unread')) return 'gmail_get_unread_count';
    if (d.includes('enviar') || d.includes('send') || d.includes('mandar')) return 'gmail_send_email';
    return 'gmail_list_inbox';
  }
  if (d.includes('calendar') || d.includes('calendario') || d.includes('evento') || d.includes('reunión')) {
    if (d.includes('crear') || d.includes('create') || d.includes('agregar')) return 'calendar_create_event';
    return 'calendar_list_events';
  }
  
  return null;
}

export function loadActivePlan() {
  try {
    const saved = store.get('_activePlan');
    if (saved) planner.loadPlan(saved);
  } catch {}
}

export function getPlanSummary() {
  return planner.getSummary();
}

export { planner, reflector };
