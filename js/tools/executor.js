import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';
import { showProgressSteps, showProgressStep, showSystemErrorMessage } from '../chat/messages.js';

import {
  handlePowerShell, handleOpenBrowser, handleSetVolume, handleGetVolume,
  handleSetBrightness, handleGetBrightness,
  handleLaunchApp, handleListInstalledApps, handleRememberApp, handleForgetApp, handleListUserApps,
  handleSearchWeb, handleFetchUrl, handleAnalyzePage, handleShowNotification,
  handleGetSystemTime, handleQuickNote, handleOpenFile, handleTranslate,
  handleListProcesses, handleSystemStats, handleFindFiles, handleCleanSystem
} from './handlers/system.js';

import {
  handleFileOperation, handleComputerAction, handleDesktopAction,
  handleSetReminder, handleSetTimer, handleProcessFile
} from './handlers/desktop.js';

import {
  handleGetWeather, handleGetNews, handleGetSportsNews, handleYoutubeAction, handleYoutubeDownload, handleEditVideo
} from './handlers/media.js';

import { handleOrganizeFolder } from './handlers/organizer.js';
import { handleAnalyzePath } from './handlers/file-analyzer.js';
import { handleCreatePrompt } from './handlers/prompts.js';
import { handleCreateDocument } from './handlers/document-writer.js';

import { createLogger } from '../utils/logger.js';
const _log = createLogger('EXECUTOR');

// Category-to-tool mapping
const TOOL_CATEGORIES = {
  // SYSTEM
  launch_app: 'system', set_volume: 'system', set_brightness: 'system', get_volume: 'system', get_brightness: 'system',
  execute_powershell: 'system', open_browser: 'system', show_notification: 'system', system_stats: 'system',
  list_processes: 'system', get_system_time: 'system', list_installed_apps: 'system', remember_app: 'system', forget_app: 'system', list_user_apps: 'system', desktop_action: 'system',
  clean_system: 'system',
  computer_action: 'system',
  // FILES
  file_operation: 'files', find_files: 'files', youtube_download: 'files', edit_video: 'files',
  open_file: 'files', process_file: 'files', organize_folder: 'files', analyze_path: 'files', create_document: 'files',
  // SCREEN
  take_screenshot: 'screen', analyze_screen: 'screen',
  set_reminder: 'screen', set_timer: 'screen',
  // Unrestricted
  search_web: null, fetch_url: null, analyze_page: null,
  get_weather: null, get_news: null, get_sports_news: null,
  quick_note: null, remember_user_info: null, save_fact: null, recall_facts: null,
  save_task: null, list_tasks: null, complete_task: null, delete_task: null, save_research: null, create_plan: null, start_plan: null, update_step: null, update_plan: null, exit_plan_mode: null, analyze_path: null,
  youtube_action: null, translate_text: null, search_documents: null, create_prompt: null
};

function _checkCategory(name) {
  const catId = TOOL_CATEGORIES[name];
  if (!catId) return true; // no category restriction
  const catKey = 'jarvis_cat_' + catId;
  return localStorage.getItem(catKey) !== '0';
}

// High-risk permission mapping: tool name → localStorage key
// Session-level trust flag — toggled from Permisos UI
let _sessionTrusted = false;
export function setSessionTrusted(v) { _sessionTrusted = v; }
export function isSessionTrusted() { return _sessionTrusted; }
export function clearApprovedCache() { _approvedCache.clear(); _whitelistCache = null; }

// Whitelist cache
let _whitelistCache = null;
function _getWhitelist() {
  if (_whitelistCache !== null) return _whitelistCache;
  const raw = localStorage.getItem('jarvis_risk_whitelist') || '';
  _whitelistCache = raw.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
  return _whitelistCache;
}
function _clearWhitelistCache() { _whitelistCache = null; }

// Remembered approvals cache (per-session)
const _approvedCache = new Set();

function _matchWhitelist(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return _getWhitelist().some(pattern => {
    if (pattern.includes('*')) {
      const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/[.+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
      return re.test(text);
    }
    return lower.includes(pattern);
  });
}

const _highRiskPerms = {
  execute_powershell: 'jarvis_permExecuteArbitrary',
  kill_process: 'jarvis_permKillProcess',
  sensitive_paths: 'jarvis_permSensitivePaths',
};

async function _checkHighRiskPermission(toolName, extraCheck, contextHash) {
  const permKey = _highRiskPerms[toolName];
  if (!permKey) return true;
  // System category enabled = everything allowed, no dialogs
  if (localStorage.getItem('jarvis_cat_system') !== '0') return true;
  const enabled = localStorage.getItem(permKey) !== '0';
  if (!enabled) return false;

  // Session trust — salta todo
  if (_sessionTrusted) return true;

  // Whitelist check
  if (extraCheck && _matchWhitelist(extraCheck)) return true;

  // Ya aprobado en esta sesión
  if (contextHash && _approvedCache.has(contextHash)) return true;

  // Ya aprobado permanentemente
  if (contextHash) {
    const approved = localStorage.getItem('jarvis_approved_ops');
    if (approved) {
      try {
        const set = JSON.parse(approved);
        if (Array.isArray(set) && set.includes(contextHash)) return true;
      } catch {}
    }
  }

  const message = extraCheck
    ? `Jarvis necesita ejecutar esta acción para completar tu solicitud:\n\n${extraCheck}\n\n¿Querés permitirla?`
    : `Jarvis necesita ejecutar una acción que podría ser detectada por tu antivirus.\n\n¿Querés permitirla?`;

  try {
    if (!window.electronAPI?.showConfirmDialog) return true;
    const result = await window.electronAPI.showConfirmDialog(message);

    // result = { response: boolean, remember: boolean }
    if (!result.response) return false;

    if (contextHash) {
      if (result.remember) {
        // Guardar aprobación permanente
        const raw = localStorage.getItem('jarvis_approved_ops');
        const list = raw ? JSON.parse(raw) : [];
        if (!list.includes(contextHash)) {
          list.push(contextHash);
          localStorage.setItem('jarvis_approved_ops', JSON.stringify(list));
        }
      } else {
        // Aprobar solo para esta sesión
        _approvedCache.add(contextHash);
      }
    }
    return true;
  } catch {
    return true;
  }
}

let toolExecutionWatchdog = null;
let _activeToolNames = new Set();
const sessionContext = { lastOpenedApp: '', lastCommand: '', lastSearchTopic: '' };

const _toolLabels = {
  execute_powershell: 'Ejecutando comando',
  clean_system: 'Limpieza del sistema',
  open_browser: 'Abriendo navegador',
  set_volume: 'Ajustando volumen',
  get_volume: 'Consultando volumen',
  set_brightness: 'Ajustando brillo',
  get_brightness: 'Consultando brillo',
  launch_app: 'Abriendo aplicación',
  create_prompt: 'Creando prompt',
  list_installed_apps: 'Listando aplicaciones',
  remember_app: 'Guardando aplicación personalizada',
  forget_app: 'Olvidando aplicación',
  list_user_apps: 'Listando aplicaciones guardadas',
  search_web: 'Buscando en internet',
  fetch_url: 'Obteniendo contenido',
  show_notification: 'Mostrando notificación',
  get_system_time: 'Consultando hora',
  quick_note: 'Guardando nota',
  open_file: 'Abriendo archivo',
  get_weather: 'Consultando clima',
  get_news: 'Buscando noticias',
  get_sports_news: 'Buscando noticias deportivas',
  file_operation: 'Operando archivos',
  computer_action: 'Ejecutando acción',
  youtube_action: 'Buscando en YouTube',
  youtube_download: 'Descargando video',
  set_reminder: 'Creando recordatorio',
  set_timer: 'Iniciando temporizador',
  desktop_action: 'Acción de escritorio',
  process_file: 'Procesando archivo',
  translate_text: 'Traduciendo',
  list_processes: 'Listando procesos',
  system_stats: 'Analizando sistema',
  find_files: 'Buscando archivos',
  remember_user_info: 'Recordando información',
  save_fact: 'Guardando hecho importante',
  recall_facts: 'Recordando hechos',
  save_task: 'Guardando tarea',
  list_tasks: 'Listando tareas',
  complete_task: 'Completando tarea',
  delete_task: 'Eliminando tarea',
  deep_research: 'Investigando a fondo',
  save_research: 'Guardando investigación',
  analyze_page: 'Analizando página web',
  take_screenshot: 'Capturando pantalla',
  analyze_screen: 'Analizando pantalla',
  edit_video: 'Editando video',
  organize_folder: 'Organizando carpeta'
};

function _getToolDescription(call) {
  if (call.name === 'organize_folder' && call.args?.mode === 'inspect') {
    return 'Inspeccionando carpeta: ' + (call.args?.path || '');
  }
  const base = _toolLabels[call.name] || 'Ejecutando ' + call.name;
  const detail = call.args?.description || call.args?.query || call.args?.appName || call.args?.path || call.args?.url || '';
  return detail ? base + ': ' + detail : base;
}

async function _trackCommand(commandType) {
  if (!commandType) return;
  try {
    const memory = await window.electronAPI.memoryRead();
    if (!memory.frequentCommands) memory.frequentCommands = {};
    const key = commandType.toLowerCase().trim();
    memory.frequentCommands[key] = (memory.frequentCommands[key] || 0) + 1;
    const { default: bus } = await import('../utils/event-bus.js');
    bus.emit('memory:write-requested', memory);
  } catch (e) {
    _log('error', `trackCommand: ${e.message}`);
  }
}

function _updateFocusHudStatus(toolCall) {}

async function _withTimeout(promise, name, timeoutMs = 15000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms): ${name}`)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function _dispatchTool(call, store, sessionContext) {
  if (!call.args) call.args = {};

  // Category permission check
  if (!_checkCategory(call.name)) {
    return { success: false, output: 'Permiso denegado: la categoría necesaria está desactivada en Configuración > Permisos.' };
  }

  // High-risk permission check
  let riskCheck = true;
  if (call.name === 'execute_powershell') {
    const cmd = call.args.command || '';
    riskCheck = await _checkHighRiskPermission('execute_powershell', cmd, 'ps_' + cmd.substring(0, 80));
  } else if (call.name === 'list_processes' && call.args.action === 'kill') {
    const target = call.args.name || call.args.pid || '';
    riskCheck = await _checkHighRiskPermission('kill_process', `Matar proceso: ${target}`, 'kill_' + target);
  } else if (call.name === 'file_operation' && call.args.path) {
    const path = call.args.path.toLowerCase();
    if (path.includes('\\windows\\') || path.includes('\\system32') || path.includes('%appdata%')) {
      riskCheck = await _checkHighRiskPermission('sensitive_paths', `Operación en ruta sensible: ${call.args.path}`, 'path_' + call.args.path);
    }
    if (call.args.operation === 'delete' || call.args.operation === 'delete_folder') {
      const sensitiveUserFolders = ['\\downloads', '\\desktop', '\\documents', '\\mis documentos', '\\escritorio', '\\documentos'];
      const isSensitiveUser = sensitiveUserFolders.some(f => path.includes(f));
      if (isSensitiveUser) {
        riskCheck = await _checkHighRiskPermission('delete_user_files', `Eliminar archivos de usuario: ${call.args.path}`, 'del_' + call.args.path);
      }
    }
  } else if (call.name === 'clean_system' && call.args?.mode === 'clean') {
    riskCheck = await _checkHighRiskPermission('execute_powershell', 'Eliminar archivos temporales, caché de npm y vaciar la papelera de reciclaje.', 'clean_system');
  }
  if (!riskCheck) {
    return { success: false, output: 'Operación bloqueada por permiso de alto riesgo.' };
  }

  if (call.name === 'execute_powershell') {
    _log('info', `PS: ${(call.args.command || '').substring(0, 120)}`);
    sessionContext.lastCommand = call.args.command;
    const appMatch = (call.args.command || '').match(/(?:start-process|start)\s+["']?([\w\-.:]+)/i);
    if (appMatch) sessionContext.lastOpenedApp = appMatch[1];
    const result = await handlePowerShell(call);
    if (result.success && result.output && result.output.trim()) {
      _trackCommand(call.args.description || call.args.command);
    } else if (!result.success) {
      _log('error', `PS Error: ${result.output}`);
    }
    return result;
  } else if (call.name === 'clean_system') {
    _log('info', `Clean system: ${call.args.mode || 'analyze'}`);
    const result = await handleCleanSystem(call);
    if (result.success) _trackCommand('system:clean:' + (call.args.mode || 'analyze'));
    else _log('error', `Clean system error: ${result.output}`);
    return result;
  } else if (call.name === 'open_browser') {
    _log('info', `Browser: ${call.args.url}`);
    sessionContext.lastOpenedApp = 'Navegador';
    sessionContext.lastSearchTopic = call.args.reason || call.args.url;
    const result = await handleOpenBrowser(call);
    if (result.success) _trackCommand(`navegador: ${call.args.url}`);
    else _log('error', `Browser error: ${result.output}`);
    return result;
  } else if (call.name === 'set_volume') {
    const result = await handleSetVolume(call);
    if (result.success) _trackCommand(`volumen: ${call.args.percentage}%`);
    return result;
  } else if (call.name === 'get_volume') {
    const result = await handleGetVolume(call);
    return result;
  } else if (call.name === 'set_brightness') {
    const result = await handleSetBrightness(call);
    if (result.success) _trackCommand(`brillo: ${call.args.percentage}%`);
    return result;
  } else if (call.name === 'get_brightness') {
    const result = await handleGetBrightness(call);
    return result;
  } else if (call.name === 'launch_app') {
    _log('info', `Launch: "${call.args.appName}"`);
    const result = await handleLaunchApp(call);
    if (result.success) {
      sessionContext.lastOpenedApp = call.args.appName;
      _trackCommand(`app: ${call.args.appName}`);
    } else _log('error', `App launch fail: ${result.output}`);
    return result;
  } else if (call.name === 'list_installed_apps') {
    _log('info', 'Listing installed apps');
    const result = await handleListInstalledApps(call);
    return result;
  } else if (call.name === 'remember_app') {
    _log('info', `Remember app: "${call.args.name}" → "${call.args.path}"`);
    const result = await handleRememberApp(call);
    if (result.success) _trackCommand('remember_app');
    return result;
  } else if (call.name === 'forget_app') {
    _log('info', `Forget app: "${call.args.name}"`);
    const result = await handleForgetApp(call);
    if (result.success) _trackCommand('forget_app');
    return result;
  } else if (call.name === 'list_user_apps') {
    _log('info', 'Listing user-defined apps');
    const result = await handleListUserApps();
    return result;
  } else if (call.name === 'search_web') {
    showProgressSteps(1, 3, 'Búsqueda ' + (call.args.engine || 'duckduckgo'));
    const result = await handleSearchWeb(call);
    if (result.success) {
      sessionContext.lastSearchTopic = call.args.query;
      _trackCommand(`buscar: ${call.args.query}`);
      if (result.links && result.links.length > 0) {
        try {
          const { bus } = await import('../utils/event-bus.js');
          bus.emit('web:links', result.links);
        } catch {}
      }
    }
    return result;
  } else if (call.name === 'fetch_url') {
    const result = await handleFetchUrl(call);
    if (result.success) _trackCommand(`fetch: ${call.args.url}`);
    return result;
  } else if (call.name === 'analyze_page') {
    const result = await handleAnalyzePage(call);
    if (result.success) _trackCommand(`analyze_page: ${call.args.url}`);
    return result;
  } else if (call.name === 'show_notification') {
    const result = await handleShowNotification(call.args.title, call.args.body);
    _trackCommand('notificación');
    return result;
  } else if (call.name === 'get_system_time') {
    const result = await handleGetSystemTime();
    _trackCommand('hora');
    return result;
  } else if (call.name === 'quick_note') {
    _log('info', `Quick note: ${(call.args.note || '').substring(0, 100)}`);
    const result = await handleQuickNote(call, store);
    _trackCommand('nota');
    return result;
  } else if (call.name === 'create_prompt') {
    _log('info', `Create prompt: ${(call.args.title || call.args.prompt || '').substring(0, 100)}`);
    const result = await handleCreatePrompt(call);
    _trackCommand('prompt');
    return result;
  } else if (call.name === 'open_file') {
    _log('info', `Open file: ${call.args.path}`);
    const result = await handleOpenFile(call);
    if (result.success) _trackCommand(`archivo: ${call.args.path}`);
    else _log('error', `openPath error: ${result.output}`);
    return result;
  } else if (call.name === 'get_weather') {
    const result = await handleGetWeather(call, store);
    if (result.success) _trackCommand('clima');
    return result;
  } else if (call.name === 'translate_text') {
    const result = await handleTranslate(call);
    if (result.success) _trackCommand(`translate:${call.args.targetLang || 'es'}`);
    return result;
  } else if (call.name === 'list_processes') {
    _log('info', `Process ${call.args.action}: ${call.args.name || call.args.pid}`);
    const result = await handleListProcesses(call);
    if (result.success) _trackCommand(`process:${call.args.action}`);
    return result;
  } else if (call.name === 'system_stats') {
    _log('info', 'System stats');
    const result = await handleSystemStats();
    if (result.success) _trackCommand('system:stats');
    return result;
  } else if (call.name === 'find_files') {
    _log('info', `Search files: ${call.args.pattern}`);
    const result = await handleFindFiles(call);
    if (result.success) _trackCommand(`find:${call.args.pattern}`);
    return result;
  } else if (call.name === 'set_timer') {
    _log('info', `Timer: ${call.args.label} (${call.args.duration}s)`);
    const result = await handleSetTimer(call);
    if (result.success) _trackCommand(`timer:${call.args.label}`);
    return result;
  } else if (call.name === 'get_news') {
    const result = await handleGetNews(call);
    if (result.success) _trackCommand(call.args.topic ? `noticias: ${call.args.topic}` : 'noticias');
    return result;
  } else if (call.name === 'get_sports_news') {
    _log('info', `Sports news: ${call.args.sport || 'general'}`);
    const result = await handleGetSportsNews(call);
    if (result.success) _trackCommand(`deportes: ${call.args.sport || 'general'}`);
    return result;
  } else if (call.name === 'file_operation') {
    // Redirect "inspect" to organize_folder — Gemini sometimes confuses both
    if (call.args?.operation === 'inspect') {
      call.name = 'organize_folder';
      call.args = { path: call.args.path, mode: 'inspect', filter: call.args.filter };
      _log('info', `[REDIRECT] file_operation(inspect) → organize_folder(inspect) path="${call.args.path}"`);
      const result = await handleOrganizeFolder(call);
      if (result.success) _trackCommand('organize_folder:inspect');
      return result;
    }
    _log('info', `File op: ${call.args.operation} ${call.args.path}`);
    const result = await handleFileOperation(call);
    if (result.success) _trackCommand(`file:${call.args.operation}`);
    return result;
  } else if (call.name === 'analyze_path') {
    _log('info', `analyze_path: "${call.args.path}"${call.args.deep ? ' (deep)' : ''}`);
    const result = await handleAnalyzePath(call);
    if (result.success) _trackCommand('analyze_path');
    return result;
  } else if (call.name === 'create_document') {
    _log('info', `create_document: "${call.args.title}" formato=${call.args.format || 'pdf'} secciones=${(call.args.sections || []).length}`);
    const result = await handleCreateDocument(call);
    if (result.success) _trackCommand(`doc:${call.args.format || 'pdf'}`);
    return result;
  } else if (call.name === 'computer_action') {
    _log('info', `Computer action: ${call.args.action}`);
    const result = await handleComputerAction(call);
    if (result.success) _trackCommand(`computer:${call.args.action}`);
    return result;
  } else if (call.name === 'youtube_action') {
    const result = await handleYoutubeAction(call);
    if (result.success) _trackCommand(`youtube: ${call.args.query}`);
    return result;
  } else if (call.name === 'youtube_download') {
    const result = await handleYoutubeDownload(call);
    if (result.success) _trackCommand(`youtube_download: ${(call.args.url || '').substring(0, 60)}`);
    return result;
  } else if (call.name === 'set_reminder') {
    const result = await handleSetReminder(call);
    if (result.success) _trackCommand('recordatorio');
    return result;
  } else if (call.name === 'desktop_action') {
    _log('info', `Desktop action: ${call.args.action}`);
    const result = await handleDesktopAction(call);
    if (result.success) _trackCommand(`desktop:${call.args.action}`);
    return result;
  } else if (call.name === 'process_file') {
    const ext = (call.args.format || call.args.path || '').split('.').pop().toLowerCase();
    showProgressSteps(1, 1, 'Procesando: ' + (call.args.path || '').split('\\').pop());
    const result = await handleProcessFile(call);
    if (result.success) _trackCommand(`process:${ext}`);
    return result;
  } else if (call.name === 'remember_user_info') {
    _log('info', `Remembering: ${(call.args.details || '').substring(0, 100)}`);
    const memory = store.get('userMemory');
    if (memory) {
      memory.userDetails = call.args.details || '';
      const { default: bus } = await import('../utils/event-bus.js');
      bus.emit('memory:write-requested', memory);
    }
    return { success: true, output: 'Información almacenada.' };
  } else if (call.name === 'save_fact') {
    _log('info', `Saving fact: [${call.args.category}] ${(call.args.fact || '').substring(0, 80)}`);
    const { saveFact } = await import('../memory/facts.js');
    const result = saveFact(call.args.category, call.args.fact, call.args.importance);
    if (result.duplicate) return { success: true, output: 'Ya lo tenía guardado.' };
    if (result.updated) return { success: true, output: 'Recuerdo actualizado.' };
    return { success: result.saved, output: result.saved ? 'Guardado en memoria.' : 'Error al guardar.' };
  } else if (call.name === 'recall_facts') {
    _log('info', `Recalling facts: cat=${call.args.category || ''} kw=${call.args.keyword || ''}`);
    const { recallFacts, getMemoryStats } = await import('../memory/facts.js');
    if (call.args.stats) {
      const stats = getMemoryStats();
      return { success: true, output: `Memoria: ${stats.total}/${stats.limit} hechos guardados. Categorías: ${stats.categories.join(', ')}` };
    }
    const facts = recallFacts(call.args.category, call.args.keyword, call.args.limit || 20);
    if (facts.length === 0) return { success: true, output: 'No encontré nada guardado sobre eso.' };
    const importanceOrder = { critical: 3, high: 2, normal: 1, low: 0 };
    const text = facts.map(f => {
      const imp = f.importance === 'critical' ? '⭐' : f.importance === 'high' ? '▲' : '';
      return `${imp}[${f.category}] ${f.fact}`;
    }).join('\n');
    return { success: true, output: `${facts.length} hecho(s) encontrado(s):\n${text}` };
  } else if (call.name === 'save_task') {
    _log('info', `Saving task: ${(call.args.title || '').substring(0, 80)}`);
    const { saveTask } = await import('../memory/tasks.js');
    const task = saveTask(call.args.title, call.args.category, call.args.description, call.args.dueDate, call.args.priority);
    if (!task) return { success: false, output: 'Error al guardar tarea.' };
    _trackCommand(`task:${call.args.category || 'general'}`);
    return { success: true, output: `Tarea guardada: "${task.title}" [${task.category}] (ID: ${task.id})` };
  } else if (call.name === 'list_tasks') {
    _log('info', `Listing tasks: cat=${call.args.category || ''} status=${call.args.status || ''}`);
    const { listTasks } = await import('../memory/tasks.js');
    const tasks = listTasks(call.args.category, call.args.status, call.args.keyword);
    if (tasks.length === 0) return { success: true, output: 'No se encontraron tareas.' };
    const text = tasks.map(t => {
      const statusIcon = t.status === 'completed' ? '[HECHA]' : '[PENDIENTE]';
      const due = t.dueDate ? ` (para: ${t.dueDate})` : '';
      const prio = t.priority === 'high' ? ' ⚠' : '';
      return `${statusIcon} ${t.title} [${t.category}]${due}${prio} — ID: ${t.id}`;
    }).join('\n');
    return { success: true, output: `${tasks.length} tarea(s):\n${text}` };
  } else if (call.name === 'complete_task') {
    _log('info', `Completing task: ${call.args.taskId || ''}`);
    const { completeTask } = await import('../memory/tasks.js');
    const task = completeTask(call.args.taskId);
    if (!task) return { success: false, output: 'Tarea no encontrada.' };
    _trackCommand('task:complete');
    return { success: true, output: `Tarea completada: "${task.title}"` };
  } else if (call.name === 'delete_task') {
    _log('info', `Deleting task: ${call.args.taskId || ''}`);
    const { deleteTask } = await import('../memory/tasks.js');
    const ok = deleteTask(call.args.taskId);
    if (!ok) return { success: false, output: 'Tarea no encontrada.' };
    _trackCommand('task:delete');
    return { success: true, output: 'Tarea eliminada.' };
  } else if (call.name === 'save_research') {
    _log('info', `Save research: "${(call.args.title || '').substring(0, 60)}"`);
    try {
      const home = store.get('homeDir') || 'C:\\Users\\Admin';
      const researchDir = home + '\\Documents\\Jarvis\\Investigaciones';
      const category = (call.args.category || 'general').replace(/[^a-zA-Z0-9_\-]/g, '');
      const catDir = researchDir + '\\' + category;
      await window.electronAPI.fileWrite(catDir + '\\.gitkeep', '');
      const title = (call.args.title || 'sin-titulo').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ\s]/g, '').trim() || 'sin-titulo';
      const filePath = catDir + '\\' + title + '.md';
      const content = `# ${title}\n\n**Categoría:** ${category}\n**Fecha:** ${new Date().toLocaleDateString('es-ES')}\n\n---\n\n${call.args.content || ''}`;
      const result = await window.electronAPI.fileWrite(filePath, content);
      if (!result.success) return { success: false, output: 'No se pudo guardar el archivo.' };
      _trackCommand('research:save');
      return { success: true, output: `Investigación guardada: "${title}" en ${filePath}` };
    } catch (e) {
      return { success: false, output: `Error al guardar: ${e.message}` };
    }
  } else if (call.name === 'search_documents') {

    _log('info', `Search documents: "${(call.args.query || '').substring(0, 80)}"`);
    const { searchFiles } = await import('../system/file-system/FileSearcher.js');
    const result = await searchFiles({
      query: call.args.query || '',
      roots: ['Documents', 'Downloads', 'Desktop'],
      searchMode: 'content',
      maxResults: 20,
    });
    if (!result.success) return { success: false, output: result.message || 'Error al buscar.' };
    const items = result.data?.results || [];
    if (items.length === 0) return { success: true, output: `No encontré nada sobre "${call.args.query}" en tus documentos.` };
    let output = `Encontré ${items.length} archivo${items.length !== 1 ? 's' : ''} con información sobre "${call.args.query}":\n\n`;
    for (const r of items.slice(0, 10)) {
      const name = r.file.split('\\').pop();
      output += `📄 ${name}\n  "${r.snippet || ''}"\n\n`;
    }
    if (items.length > 10) output += `...y ${items.length - 10} archivo${items.length - 10 !== 1 ? 's' : ''} más.\n`;
    output += 'Podés pedirme que abra alguno o que te lea el contenido completo.';
    _trackCommand('search:documents');
    return { success: true, output };
  } else if (call.name === 'take_screenshot' || call.name === 'analyze_screen') {
    _log('info', `Vision: ${call.name} — pregunta: "${(call.args.question || '').substring(0, 80)}"`);
    try {
      const { captureScreen } = await import('../engines/vision/index.js');
      const cap = await captureScreen();
      if (!cap.success) {
        return { success: false, output: 'No se pudo capturar la pantalla.' };
      }
      _trackCommand('vision:screenshot');
      const question = call.args.question || call.args.prompt || '';
      if (window.electronAPI?.geminiTextChat) {
        try {
          const parts = [{ text: question || 'Describí en detalle qué ves en esta captura de pantalla.' }];
          parts.push({ inlineData: { mimeType: 'image/png', data: cap.base64 } });
          const result = await window.electronAPI.geminiTextChat({
            messages: [{ role: 'user', parts }],
            systemInstruction: ''
          });
          if (result.success) {
            return { success: true, output: result.response };
          }
        } catch (restErr) {
          _log('error', `REST vision fallback: ${restErr.message}`);
        }
      }
      return { success: true, output: 'Captura de pantalla realizada. Analizando contenido visual...' };
    } catch (e) {
      return { success: false, output: `Error de visión: ${e.message}` };
    }
  } else if (call.name === 'edit_video') {
    _log('info', `Edit video: ${call.args.operation} on ${call.args.input}`);
    const result = await handleEditVideo(call);
    _trackCommand(`edit_video:${call.args.operation}`);
    return result;
  } else if (call.name === 'organize_folder') {
    _log('info', `Organizer: mode=${call.args.mode || 'preview'} path="${call.args.path}"`);
    const result = await handleOrganizeFolder(call);
    if (result.success) _trackCommand(`organize_folder:${call.args.mode || 'preview'}`);
    return result;
  } else if (call.name === 'create_plan') {
    _log('info', `Create plan: "${(call.args.title || '').substring(0, 60)}" (${(call.args.steps || []).length} steps)`);
    try {
      const { createPlan } = await import('../memory/plans.js');
      const plan = createPlan(call.args.title, call.args.goal, call.args.steps, call.args.category);
      if (!plan) return { success: false, output: 'Error al crear el plan.' };
      _trackCommand('plan:create');
      const stepsSummary = plan.steps.map((s, i) => `  ${i + 1}. ${s.desc}`).join('\n');
      return { success: true, output: `Plan creado: "${plan.title}" (${plan.steps.length} pasos)\n\n${stepsSummary}\n\nAbrí el panel Plan (ícono en la barra superior) para verlo. Podés ejecutarlo con "ejecutá el plan".` };
    } catch (e) {
      return { success: false, output: `Error al crear plan: ${e.message}` };
    }
  } else if (call.name === 'start_plan') {
    _log('info', `Start plan: ${call.args.planId || ''}`);
    try {
      const { getPlan } = await import('../memory/plans.js');
      const plan = getPlan(call.args.planId);
      if (!plan) return { success: false, output: 'Plan no encontrado.' };
      store.set('_activePlanMode', plan.id);
      _trackCommand('plan:start');
      return { success: true, output: `MODO PLAN activado. Ejecutando: "${plan.title}". Seguí los pasos uno por uno. Cuando termines, llamá exit_plan_mode.`, _resetChat: true, _planId: plan.id };
    } catch (e) {
      return { success: false, output: `Error al iniciar plan: ${e.message}` };
    }
  } else if (call.name === 'update_step') {
    _log('info', `Update step: plan=${call.args.planId} idx=${call.args.stepIndex} status=${call.args.status}`);
    try {
      const { updateStep } = await import('../memory/plans.js');
      const result = updateStep(call.args.planId, call.args.stepIndex, call.args.status, call.args.result, call.args.error);
      if (!result) return { success: false, output: 'Paso o plan no encontrado.' };
      const { plan, step } = result;
      const done = plan.steps.filter(s => s.status === 'done').length;
      const total = plan.steps.length;
      if (plan.status === 'completed') {
        store.set('_activePlanMode', null);
        return { success: true, output: `✅ Paso completado: "${step.desc}". Plan "${plan.title}" FINALIZADO (${done}/${total} pasos). Volviendo a modo normal.`, _planComplete: true };
      }
      return { success: true, output: `Paso ${call.args.stepIndex + 1}/${total} marcado como "${call.args.status}": "${step.desc}" (${done}/${total} completados)` };
    } catch (e) {
      return { success: false, output: `Error al actualizar paso: ${e.message}` };
    }
  } else if (call.name === 'exit_plan_mode') {
    store.set('_activePlanMode', null);
    _trackCommand('plan:exit');
    return { success: true, output: 'Modo plan desactivado. Volviendo a conversación normal.', _exitPlanMode: true };
  } else if (call.name === 'update_plan') {
    _log('info', `Update plan: ${call.args.planId || ''}`);
    try {
      const { getPlan, updatePlan } = await import('../memory/plans.js');
      const plan = getPlan(call.args.planId);
      if (!plan) return { success: false, output: 'Plan no encontrado.' };
      const updates = {};
      if (call.args.title) updates.title = call.args.title;
      if (call.args.goal) updates.goal = call.args.goal;
      if (call.args.category) updates.category = call.args.category;
      if (call.args.steps) {
        const doneSteps = plan.steps.filter(s => s.status === 'done' || s.status === 'failed');
        updates.steps = call.args.steps.map((s, i) => {
          const existing = i < doneSteps.length ? doneSteps[i] : null;
          return {
            id: existing ? existing.id : 'step_' + Date.now().toString(36) + '_' + i,
            index: i,
            desc: s.desc || s.description || '',
            status: existing ? existing.status : 'pending',
            result: existing ? existing.result : null,
            error: existing ? existing.error : null
          };
        });
      }
      const updated = updatePlan(call.args.planId, updates);
      if (!updated) return { success: false, output: 'Error al actualizar plan.' };
      _trackCommand('plan:update');
      const done = updated.steps.filter(s => s.status === 'done').length;
      return { success: true, output: `Plan actualizado: "${updated.title}" (${done}/${updated.steps.length} pasos). Podés seguir ejecutando los pasos pendientes.` };
    } catch (e) {
      return { success: false, output: `Error al actualizar plan: ${e.message}` };
    }
  } else if (call.name.startsWith('plan_') || call.name.startsWith('planner_')) {
    const { executeTool } = await import('../engines/ai/planner/index.js');
    const result = await executeTool(call.name, call.args || {});
    return { success: true, output: typeof result === 'string' ? result : JSON.stringify(result) };
  } else if (
    call.name.startsWith('github_') || call.name.startsWith('get_weather_') ||
    call.name.startsWith('gmail_') || call.name.startsWith('youtube_list_') ||
    call.name.startsWith('youtube_get_') || call.name.startsWith('youtube_update_') ||
    call.name.startsWith('youtube_my_') || call.name.startsWith('calendar_') ||
    call.name.startsWith('notion_') || call.name.startsWith('spotify_') ||
    call.name.startsWith('telegram_') || call.name.startsWith('discord_') ||
    call.name.startsWith('slack_')
  ) {
    const { executeIntegrationTool } = await import('../engines/integration/index.js');
    const result = await executeIntegrationTool(call.name, call.args || {});
    if (!result.success) _log('error', `Integration error: ${result.output}`);
    return result;
  } else {
    _log('warn', `Herramienta desconocida: ${call.name}`);
    return { success: false, output: `Herramienta "${call.name}" no reconocida.` };
  }
}

export async function executeToolCall(calls) {
  const newNames = new Set(calls.map(c => c.name));
  const alreadyRunning = [...newNames].filter(n => _activeToolNames.has(n));
  if (alreadyRunning.length > 0) {
    _log('warn', `Herramienta(s) ya en ejecución, ignorando duplicado: ${alreadyRunning.join(', ')}`);
    return;
  }
  for (const n of newNames) _activeToolNames.add(n);

  store.set('isExecutingTool', true);
  store.set('toolCount', calls.length);
  store.set('toolStartTime', Date.now());

  if (store.get('focusMode')) {
    store.set('_isSpecialFocusTurn', true);
    if (calls[0]) _updateFocusHudStatus(calls[0]);
  }

  if (toolExecutionWatchdog) clearTimeout(toolExecutionWatchdog);
  toolExecutionWatchdog = setTimeout(() => {
    _log('warn', 'Tool execution watchdog triggered');
    store.set('toolCount', 0);
    store.set('toolStartTime', null);
    store.set('isExecutingTool', false);
    store.setState(STATE.IDLE);
  }, 180000);

  store.setState(STATE.WORKING);
  let _toolCallId = null;
  if (window.JarvisSupervisor) _toolCallId = window.JarvisSupervisor.recordToolCall(calls);

  _log('info', `=== EJECUTANDO ${calls.length} HERRAMIENTA(S) ===`);

  const responses = [];
  const totalTools = calls.length;
  let completedSteps = 0;

  try {
    for (let ci = 0; ci < totalTools; ci++) {
      const call = calls[ci];
      if (store.get('focusMode')) _updateFocusHudStatus(call);

      let result = { success: false, output: 'Herramienta no reconocida.' };
      const actionDesc = _getToolDescription(call);
      showProgressSteps(ci + 1, totalTools, actionDesc);
      store.set('_currentToolDesc', actionDesc);

      // Per-tool timeouts
      const toolTimeout =
        call.name === 'deep_research'      ? 120000 :
        call.name === 'analyze_page'       ? 60000  :
        call.name === 'organize_folder'    ? (call.args?.mode === 'execute' ? 60000 : 45000) :
        call.name === 'youtube_download'   ? 90000  :
        call.name === 'system_stats'       ? 30000  :
        call.name === 'list_installed_apps' ? 60000 :
        (call.name === 'launch_app' || call.name === 'find_files') ? 45000 :
        (call.name === 'execute_powershell' || call.name === 'computer_action' || call.name === 'file_operation') ? 25000 :
        (call.name === 'take_screenshot' || call.name === 'analyze_screen' || call.name === 'set_brightness' || call.name === 'set_volume' || call.name === 'clean_system') ? 60000 : 15000;

      try {
        result = await _withTimeout(_dispatchTool(call, store, sessionContext), call.name, toolTimeout);
      } catch (toolErr) {
        _log('error', `Error en ${call.name}: ${toolErr.message}`);
        if (window.JarvisSupervisor) {
          window.JarvisSupervisor.record('tool_error', { name: call.name, error: toolErr.message });
          window.JarvisSupervisor.recordToolResult(_toolCallId, call.name, { success: false, output: toolErr.message });
        }
        result = { success: false, output: toolErr.message };
      }

      completedSteps++;
      if (result.success) {
        showProgressSteps(ci + 1, totalTools, '✓ ' + call.name);
      } else {
        showProgressStep('error', 'Fallo', call.name + ': ' + (result.output || '').substring(0, 60));
      }
      if (window.JarvisSupervisor && result) window.JarvisSupervisor.recordToolResult(_toolCallId, call.name, result);

      const respPayload = {
        success: result.success,
        result: result.success
          ? (result.output?.trim() || 'Completado exitosamente.')
          : `Error de ejecución: ${result.output || 'fallo desconocido'}`,
        app: sessionContext.lastOpenedApp || '',
        topic: sessionContext.lastSearchTopic || ''
      };
      if (result._resetChat) respPayload._resetChat = true;
      if (result._planComplete) respPayload._planComplete = true;
      if (result._exitPlanMode) respPayload._exitPlanMode = true;
      responses.push({
        id: call.id,
        name: call.name,
        response: respPayload
      });

      if (!result.success) _log('warn', `Tool ${call.name} failed: ${(result.output || '').substring(0, 120)}`);
    }

    // Show completion status, then auto-hide after 2.5s
    const { showDoneStatus, _hideProgress } = await import('../chat/messages.js');
    showDoneStatus(totalTools);
    setTimeout(() => { try { _hideProgress(); } catch (e) {} }, 2500);

  } catch (loopErr) {
    _log('error', `Error fatal en executeToolCall: ${loopErr.message}`);
    showSystemErrorMessage(`Error interno del sistema: ${loopErr.message}`);
    const { showDoneStatus } = await import('../chat/messages.js');
    showDoneStatus(completedSteps || 1);
  } finally {
    _log('info', '=== HERRAMIENTAS COMPLETADAS ===');
    for (const n of newNames) _activeToolNames.delete(n);
    store.set('toolCount', 0);
    store.set('toolStartTime', null);
    if (toolExecutionWatchdog) { clearTimeout(toolExecutionWatchdog); toolExecutionWatchdog = null; }
  }

  store.setState(STATE.IDLE);

  _log('info', 'Enviando toolResponse a Gemini.');
  store.set('isExecutingTool', false);
  const ws = window.ws;
  // Strip internal fields from responses before sending to Gemini's API
  // Strip internal fields from responses before sending to Gemini's API
  const cleanResponses = responses.map(r => {
    const resp = { ...r.response };
    delete resp._resetChat;
    delete resp._planComplete;
    delete resp._exitPlanMode;
    return { id: r.id, name: r.name, response: resp };
  });
  if (ws) ws.send(JSON.stringify({ toolResponse: { functionResponses: cleanResponses } }));

  // Handle special plan mode flags
  const hasReset = responses.some(r => r.response._resetChat);
  const hasPlanComplete = responses.some(r => r.response._planComplete);
  const hasExit = responses.some(r => r.response._exitPlanMode);
  if (hasReset) {
    _log('info', 'Plan mode activated — resetting chat and reconnecting');
    setTimeout(async () => {
      const { _resetTurnState } = await import('../chat/messages.js');
      const { resetGreetingFlag } = await import('../Core/Connection/handler.js');
      await _resetTurnState();
      store.set('messageCount', 0);
      store.set('conversationHistory', []);
      resetGreetingFlag();
      const ws2 = window.ws;
      if (ws2 && (ws2.readyState === 1 || ws2.readyState === 0)) {
        store.set('isReconnectingIntentional', true);
        ws2.close();
      } else {
        const { connectWebSocket } = await import('../Core/Connection/manager.js');
        connectWebSocket();
      }
    }, 500);
  } else if (hasPlanComplete || hasExit) {
    _log('info', 'Plan mode deactivated');
    store.set('_activePlanMode', null);
  }
}
