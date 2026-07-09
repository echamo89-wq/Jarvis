import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';
import { showProgressSteps, showProgressStep, showSystemErrorMessage } from '../chat/messages.js';

import {
  handlePowerShell, handleOpenBrowser, handleSetVolume, handleSetBrightness,
  handleLaunchApp, handleSearchWeb, handleFetchUrl, handleShowNotification,
  handleGetSystemTime, handleQuickNote, handleOpenFile, handleTranslate,
  handleListProcesses, handleSystemStats, handleFindFiles
} from './handlers/system.js';

import {
  handleFileOperation, handleComputerAction, handleDesktopAction,
  handleSetReminder, handleSetTimer, handleProcessFile
} from './handlers/desktop.js';

import {
  handleGetWeather, handleGetNews, handleYoutubeAction, handleYoutubeDownload, handleEditVideo
} from './handlers/media.js';

import { handleDeepResearch } from './handlers/research.js';

import { createLogger } from '../utils/logger.js';
const _log = createLogger('EXECUTOR');

let toolExecutionWatchdog = null;
const sessionContext = { lastOpenedApp: '', lastCommand: '', lastSearchTopic: '' };

const _toolLabels = {
  execute_powershell: 'Ejecutando comando',
  open_browser: 'Abriendo navegador',
  set_volume: 'Ajustando volumen',
  set_brightness: 'Ajustando brillo',
  launch_app: 'Abriendo aplicación',
  search_web: 'Buscando en internet',
  fetch_url: 'Obteniendo contenido',
  show_notification: 'Mostrando notificación',
  get_system_time: 'Consultando hora',
  quick_note: 'Guardando nota',
  open_file: 'Abriendo archivo',
  get_weather: 'Consultando clima',
  get_news: 'Buscando noticias',
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
  deep_research: 'Investigando a fondo',
  take_screenshot: 'Capturando pantalla',
  edit_video: 'Editando video'
};

function _getToolDescription(call) {
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
  } else if (call.name === 'set_brightness') {
    const result = await handleSetBrightness(call);
    if (result.success) _trackCommand(`brillo: ${call.args.percentage}%`);
    return result;
  } else if (call.name === 'launch_app') {
    _log('info', `Launch: "${call.args.appName}"`);
    const result = await handleLaunchApp(call);
    if (result.success) {
      sessionContext.lastOpenedApp = call.args.appName;
      _trackCommand(`app: ${call.args.appName}`);
    } else _log('error', `App launch fail: ${result.output}`);
    return result;
  } else if (call.name === 'search_web') {
    showProgressSteps(1, 3, 'Búsqueda ' + (call.args.engine || 'duckduckgo'));
    const result = await handleSearchWeb(call);
    if (result.success) {
      sessionContext.lastSearchTopic = call.args.query;
      _trackCommand(`buscar: ${call.args.query}`);
    }
    return result;
  } else if (call.name === 'fetch_url') {
    const result = await handleFetchUrl(call);
    if (result.success) _trackCommand(`fetch: ${call.args.url}`);
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
  } else if (call.name === 'file_operation') {
    _log('info', `File op: ${call.args.operation} ${call.args.path}`);
    const result = await handleFileOperation(call);
    if (result.success) _trackCommand(`file:${call.args.operation}`);
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
    _log('info', `Saving fact: ${(call.args.fact || '').substring(0, 100)}`);
    const { saveFact } = await import('../memory/facts.js');
    const ok = saveFact(call.args.category, call.args.fact, call.args.importance);
    return { success: ok, output: ok ? 'Hecho guardado.' : 'Error al guardar hecho.' };
  } else if (call.name === 'recall_facts') {
    _log('info', `Recalling facts: cat=${call.args.category || ''} kw=${call.args.keyword || ''}`);
    const { recallFacts } = await import('../memory/facts.js');
    const facts = recallFacts(call.args.category, call.args.keyword, call.args.limit);
    if (facts.length === 0) return { success: true, output: 'No se encontraron hechos guardados.' };
    const text = facts.map(f => `[${f.category}] ${f.fact}`).join('\n');
    return { success: true, output: text };
  } else if (call.name === 'deep_research') {
    _log('info', `Deep research: "${call.args.topic}" (${call.args.depth || 'normal'})`);
    const result = await handleDeepResearch(call);
    if (result.success) _trackCommand(`deep_research: ${call.args.topic}`);
    return result;
  } else if (call.name === 'take_screenshot') {
    _log('info', 'Capturing screenshot for visual analysis');
    try {
      const result = await window.electronAPI?.captureScreenshotBase64();
      if (result?.success) {
        return { success: true, output: 'Screenshot captured successfully.', _screenshotData: result.data };
      }
      return { success: false, output: result?.error || 'Failed to capture screenshot' };
    } catch (e) {
      return { success: false, output: `Screenshot error: ${e.message}` };
    }
  } else if (call.name === 'edit_video') {
    _log('info', `Edit video: ${call.args.operation} on ${call.args.input}`);
    const result = await handleEditVideo(call);
    _trackCommand(`edit_video:${call.args.operation}`);
    return result;
  } else if (call.name.startsWith('github_') || call.name.startsWith('get_weather_') || call.name.startsWith('gmail_')) {
    const { executeIntegrationTool } = await import('../integrations/index.js');
    const result = await executeIntegrationTool(call.name, call.args || {});
    if (!result.success) _log('error', `Integration error: ${result.output}`);
    return result;
  } else {
    _log('warn', `Herramienta desconocida: ${call.name}`);
    return { success: false, output: `Herramienta "${call.name}" no reconocida.` };
  }
}

export async function executeToolCall(calls) {
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
    store.setState(store.get('micActive') ? STATE.LISTENING : STATE.IDLE);
  }, 60000);

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
        call.name === 'deep_research'     ? 120000 :
        call.name === 'youtube_download'  ? 90000  :
        (call.name === 'launch_app' || call.name === 'find_files') ? 45000 :
        (call.name === 'execute_powershell' || call.name === 'computer_action' || call.name === 'file_operation') ? 25000 : 15000;

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

      responses.push({
        id: call.id,
        name: call.name,
        _screenshotData: result._screenshotData,
        response: {
          success: result.success,
          result: result.success
            ? (result.output?.trim() || 'Completado exitosamente.')
            : `Error de ejecución: ${result.output || 'fallo desconocido'}`,
          app: sessionContext.lastOpenedApp || '',
          topic: sessionContext.lastSearchTopic || ''
        }
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
    store.set('toolCount', 0);
    store.set('toolStartTime', null);
    if (toolExecutionWatchdog) { clearTimeout(toolExecutionWatchdog); toolExecutionWatchdog = null; }
  }

  store.setState(store.get('micActive') ? STATE.LISTENING : STATE.IDLE);

  _log('info', 'Enviando toolResponse a Gemini.');
  store.set('isExecutingTool', false);
  const ws = window.ws;
  if (ws) ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));

  // If any tool was take_screenshot, send the image to Gemini as a user turn
  const screenshotResult = responses.find(r => r._screenshotData);
  if (screenshotResult?._screenshotData && ws) {
    setTimeout(() => {
      const history = store.get('conversationHistory') || [];
      const turns = history.slice(-40).map(e => ({ role: e.role === 'user' ? 'user' : 'model', parts: [{ text: e.content }] }));
      turns.push({ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: screenshotResult._screenshotData } }] });
      ws.send(JSON.stringify({
        clientContent: { turns, turnComplete: true }
      }));
    }, 500);
  }
}
