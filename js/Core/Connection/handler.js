import { store } from '../../state/store.js';
import { STATE } from '../../state/constants.js';
import { executeToolCall } from '../../tools/executor.js';
import { handleJarvisTextChunk, handleJarvisTranscriptInstant, appendUserMessage, _closeActiveJarvisBubble, _resetTurnState, showSystemErrorMessage, showChatStatus, hideChatStatus } from '../../chat/messages.js';
import { updateDiagnostics } from '../../chat/diagnostics.js';
import { playPCMChunk, stopAudioPlayback, playSystemSound } from '../../audio/playback.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('WS-H');

let _debugMode = (() => { try { return !!localStorage.getItem('jarvis_debug'); } catch { return false; } })();
export function setDebugMode(enabled) { _debugMode = enabled; }
function _debug(...args) { if (_debugMode) _log('debug', args.join(' ')); }

let _greetingSentThisSession = false;
let _preWarming = false;
let _DOM = {};
function _q(id) { return _DOM[id] || (_DOM[id] = document.getElementById(id)); }
function _qs(sel) { return _DOM[sel] || (_DOM[sel] = document.querySelector(sel)); }
export function resetGreetingFlag() { _greetingSentThisSession = false; }

const MAX_RESPONSE_LENGTH = 10000;

/**
 * Elimina el monólogo interno del modelo (frases en inglés con markdown bold
 * que describen el proceso interno, ej: **Locating Minecraft Saves**)
 * antes de mostrar cualquier texto al usuario.
 */
function _sanitizeModelText(text) {
  if (!text) return text;
  let cleaned = text
    // Remover headers bold en inglés: **Initiating Research**, **Evaluating Source Accuracy**, etc.
    .replace(/\*\*(Initiating|Locating|Clarifying|Searching|Refining|Evaluating|Analyzing|Processing|Reviewing|Gathering|Synthesizing|Compiling|Fetching|Identifying|Assessing|Determining|Planning|Executing|Checking|Verifying|Scanning|Retrieving|Generating|Summarizing|Translating|Computing|Resolving)[^*]*\*\*/gi, '')
    // Remover cualquier bold genérico en inglés que empiece con mayúscula (monólogo)
    .replace(/\*\*[A-Z][a-z]+ [A-Z][a-zA-Z ]{0,60}\*\*/g, '')
    // Remover líneas que empiezan con "I'm ..."
    .replace(/^I'm [^\n]{0,400}\n?/gim, '')
    // Remover líneas que empiezan con "I am ..."
    .replace(/^I am [^\n]{0,400}\n?/gim, '')
    // Remover líneas que empiezan con "I have ..."
    .replace(/^I have [^\n]{0,400}\n?/gim, '')
    // Remover líneas que empiezan con "I will ..." / "I'll ..."
    .replace(/^I('ll| will) [^\n]{0,400}\n?/gim, '')
    // Remover líneas que empiezan con "I've ..."
    .replace(/^I've [^\n]{0,400}\n?/gim, '')
    // Remover líneas que empiezan con "I need / I find / I hit / I notice"
    .replace(/^I (need|find|hit|notice|don't|can |could |would |should )[^\n]{0,400}\n?/gim, '')
    // Remover líneas de proceso: "It seems / It looks / It appears"
    .replace(/^It (seems|looks|appears)[^\n]{0,400}\n?/gim, '')
    // Remover líneas de plan interno: "My plan / My approach / My strategy / My focus"
    .replace(/^My (plan|approach|strategy|focus|next|goal|intent)[^\n]{0,400}\n?/gim, '')
    // Remover líneas de proceso: "After / Given / Using the / Now I / First I / Let me"
    .replace(/^(After |Given |Using (the |')|Now I |First I |Then I |Let me |Before |Alright,|Okay, I|Hmm,)[^\n]{0,400}\n?/gim, '')
    // Remover cualquier párrafo que mencione herramientas internas en inglés (tool-calling thoughts)
    .replace(/^[^\n]*(deep_research|save_research|find_files|file_operation|execute_powershell)[^\n]*\n?/gim, '')
    // Limpiar saltos de línea excesivos
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Si queda vacío es porque TODA la pieza era monólogo interno — se descarta por completo
  return cleaned;
}

function _handleToolCall(calls) {
  _log('info', `[TOOLCALL] ${calls.length} herramienta(s): ${calls.map(c => c.name).join(', ')}`);
  _debug('[TOOLCALL] full:', JSON.stringify(calls.map(c => ({ name: c.name, args: JSON.stringify(c.args || {}).substring(0, 100) }))));
  store.set('toolCount', calls.length);
  showChatStatus('executing', calls.map(c => c.name).join(', '));
  const runTool = () => { executeToolCall(calls); };
  const sources = store.get('activeSources');
  if (sources.length > 0) {
    _log('info', 'Esperando fin de audio antes de ejecutar herramientas...');
    let done = false;
    const unsub = store.on('change:activeSources', (val) => {
      if (!done && val.length === 0) { done = true; unsub(); runTool(); }
    });
    setTimeout(() => { if (!done) { done = true; unsub(); runTool(); } }, 3000);
  } else { runTool(); }
}

function _handleSetupComplete() {
  updateDiagnostics('WS', 'CONECTADO');
  _log('info', '=== SETUP COMPLETO ===');
  const sessionVal = _q('diag-session');
  if (sessionVal) { sessionVal.innerText = 'ACTIVO'; sessionVal.style.color = '#2ed573'; }
  playSystemSound('ready');

  const history = store.get('conversationHistory');
  const hasHistory = Array.isArray(history) && history.length > 0;
  if (hasHistory) {
    let turns = history.slice(-20).map(e => ({ role: e.role === 'user' ? 'user' : 'model', parts: [{ text: String(e.content ?? '') }] }));
    while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
    while (turns.length > 0 && turns[turns.length - 1].role !== 'user') turns.pop();
    if (turns.length > 0) {
      window.ws.send(JSON.stringify({ clientContent: { turns, turnComplete: true } }));
      _log('info', `Historial restaurado: ${turns.length} mensajes`);
    }
  } else {
    _log('info', 'Sistemas listos y en reposo.');
  }
}

async function _handleServerContent(content) {
  _debug('_handleServerContent keys:', Object.keys(content).join(', '), 'modelTurn?', !!content.modelTurn, 'turnComplete?', !!content.turnComplete, 'textInputMode:', store.get('_textInputMode'));
  if (content.modelTurn?.parts) {
    const partTypes = content.modelTurn.parts.map(p => Object.keys(p).filter(k => p[k] !== undefined && p[k] !== null).join(',')).join(' | ');
    _debug('modelTurn parts:', partTypes);
  }

  if (store.get('waitingForResponse')) {
    const latency = Date.now() - store.get('startTime');
    const latEl = _q('diag-latency');
    if (latEl) latEl.innerText = `${latency} ms`;
    const sidebarLat = _q('diag-latency-sidebar');
    if (sidebarLat) sidebarLat.innerText = `${latency} ms`;
    store.set('waitingForResponse', false);
    if (window.JarvisSupervisor) window.JarvisSupervisor.addLatency(latency);
  }

  if (content.outputTranscription?.text) {
    const rawChunk = content.outputTranscription.text;
    const chunk = _sanitizeModelText(rawChunk);
    _log('info', `[TRANSCRIPT] ${rawChunk.substring(0, 80)}`);
    _debug('outputTranscription:', rawChunk.substring(0, 120));
    const prev = store.get('_jarvisSpeechText') || '';
    const sep = prev && !chunk.startsWith(' ') && !prev.endsWith(' ') ? ' ' : '';
    const newText = sep + chunk;
    const fullAccum = prev + newText;
    store.set('_jarvisSpeechText', fullAccum);

    if (fullAccum.trim()) {
      if (!store.get('_turnTextShown')) {
        hideChatStatus();
        store.set('_turnTextShown', true);
      }
      handleJarvisTranscriptInstant(fullAccum);
    }
  }

  if (content.inputAudioTranscription?.text) {
    const text = content.inputAudioTranscription.text;
    _log('info', `[USER SPEECH] ${text.substring(0, 80)}`);
    store.set('_lastInputTranscript', text);
  }
  _debug('serverContent keys:', Object.keys(content).join(','), 'inputAudioTranscription:', JSON.stringify(content.inputAudioTranscription));

  if (content.modelTurn?.parts) {
    const rawText = (store.get('_lastInputTranscript') || '').trim();
    const wasVoice = !!rawText;

    store.set('_lastInputTranscript', '');

    if (rawText) {
      const snapshotLastInputTranscript = store.get('_lastInputTranscript');
      if (rawText !== snapshotLastInputTranscript) {
        store.set('_lastInputTranscript', rawText);
        appendUserMessage(rawText);
        const meetingStart = /\b(tengo|estoy|entr[oé]|empiezo|inic[ioé]|comienz[ao]|voy a).*(una |la |mi |esta )?(reunión|reunion|junta|llamada)\b/i.test(rawText);
        const meetingEnd = /\b(sal[íi]|termine|termin[éó]|acab[éó]|finalic[éè]|salió|acab[óo]|ya?.{0,10}(?:(sali|termine|acabe|free|libre|disponible)))\b.*\b(reunión|reunion|junta|llamada)\b|\b(ya?.{0,10}?(sali|termine|salgo|termine|acab[éó]))\b/i.test(rawText);
        if (meetingStart) {
          store.set('_meetingMode', true);
          const mb = document.getElementById('meeting-bar');
          if (mb) mb.style.display = 'flex';
          _log('info', '[MEETING] Modo reunión activado');
        } else if (meetingEnd) {
          store.set('_meetingMode', false);
          const mb = document.getElementById('meeting-bar');
          if (mb) mb.style.display = 'none';
          _log('info', '[MEETING] Modo reunión desactivado');
        }
        const reminderWords = /\b(acuerd[aeo]|record[aá]|no se me olvid[ei]|teng[ao] que\s|cumpleaños|aniversario|mañana|próxim[ao]|la semana que viene|el (lunes|martes|miércoles|jueves|viernes|sábado|domingo))/i;
        if (reminderWords.test(rawText)) {
          _log('info', '[REMINDER] Posible recordatorio detectado en: ' + rawText.substring(0, 60));
        }
        const history = store.get('conversationHistory');
        if (history.length > 200) history.splice(0, history.length - 200);
        history.push({ role: 'user', content: rawText });
        store.set('conversationHistory', [...history]);
        if (window.JarvisSupervisor) window.JarvisSupervisor.record('user_msg', { text: rawText.substring(0, 80) });
        const count = store.get('messageCount') + 1;
        store.set('messageCount', count);
        const msgCountEl = _q('diag-msg-count');
        if (msgCountEl) msgCountEl.innerText = `${count}`;
      }
    }

    const hasAudio = content.modelTurn.parts.some(p => p.inlineData?.data);
    if (hasAudio) store.set('_turnHasAudio', true);
    const silentMode = store.get('_textInputMode');
    content.modelTurn.parts.forEach(part => {
      if (part.text) {
        const sanitized = _sanitizeModelText(part.text);
        if (!sanitized) return; // descarte completo si solo era monólogo
        if (!store.get('_turnTextShown')) {
          hideChatStatus();
          _log('info', `[TEXT] ${part.text.substring(0, 80)}`);
          store.set('_turnTextShown', true);
        }
        if (hasAudio && !silentMode) {
          handleJarvisTranscriptInstant(sanitized);
        } else {
          handleJarvisTextChunk(sanitized);
        }
      }
      if (part.inlineData?.data) {
        _debug('audio part received, size:', part.inlineData.data.length, 'silentMode:', silentMode);
        if (!silentMode) playPCMChunk(part.inlineData.data);
      }
    });
    if (silentMode && content.modelTurn.parts.some(p => p.text)) {
      const responseText = content.modelTurn.parts.filter(p => p.text).map(p => p.text).join(' ');
      if (responseText) {
        const history = store.get('conversationHistory');
        if (!history.some(e => e.role === 'model' && e.content === responseText)) {
          history.push({ role: 'model', content: responseText });
          store.set('conversationHistory', [...history]);
        }
      }
    }
  }

  if (content.turnComplete) {
    store.set('_serverCompletedTurn', true);
    const _turnUserText = store.get('_lastInputTranscript') || '';
    const _turnJarvisText = store.get('_jarvisSpeechText') || '';
    _debug('turnComplete:', 'alreadyShown:', store.get('_turnTextShown'), 'textInputMode:', store.get('_textInputMode'));
    if (_turnUserText || _turnJarvisText) {
      import('../../memory/memory-manager.js').then(m => m.storeTurn(_turnUserText, _turnJarvisText)).catch(e => _log('error', 'Error guardando turno en memoria:', e.message));
    }
    const wasTextMode = store.get('_textInputMode');
    store.set('_turnHasAudio', false);
    store.set('_textInputMode', false);
    _log('info', '=== TURNO COMPLETO ===');
    const jarvisSaid = store.get('_jarvisSpeechText');
    if (jarvisSaid) _log('info', `[TEXT] ${jarvisSaid.substring(0, 200)}`);
    hideChatStatus();
    const _greetingText = (store.get('waitingForGreetingToFinish') && jarvisSaid) ? jarvisSaid : '';
    const _alreadyShown = store.get('_turnTextShown');
    store.set('_turnTextShown', false);
    if (!_alreadyShown) {
      if (jarvisSaid) {
        store.set('_currentTurnTextBuffer', '');
        if (jarvisSaid) {
          handleJarvisTextChunk(jarvisSaid);
          if (wasTextMode && jarvisSaid) {
            const history = store.get('conversationHistory');
            if (!history.some(e => e.role === 'model' && e.content === jarvisSaid)) {
              history.push({ role: 'model', content: jarvisSaid });
              store.set('conversationHistory', [...history]);
            }
          }
        }
      }
    }
    store.set('_jarvisSpeechText', '');
    try { _closeActiveJarvisBubble(); } catch (tcErr) {
      _log('error', `turnComplete closeBubble: ${tcErr.message}`);
      _resetTurnState();
    }
    if (store.get('waitingForGreetingToFinish')) {
      store.set('waitingForGreetingToFinish', false);
      const greetingText = _greetingText || store.get('_jarvisSpeechText') || '';
      if (greetingText) {
        const clean = greetingText.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[*#_`]/g, '').trim();
        if (clean && clean.length > 3) {
          localStorage.setItem('jarvis_cached_greeting', clean);
        }
      }
      const instantEl = _qs('.message.jarvis.instant-greeting');
      if (instantEl && instantEl.parentNode) instantEl.parentNode.removeChild(instantEl);
      _log('info', `Saludo completado.`);
      store.set('_currentTurnTextBuffer', '');
      store.set('_jarvisSpeechStarted', false);
      store.set('_turnState', 'thinking');
      return;
    }
    store.set('_currentTurnTextBuffer', '');
    store.set('_jarvisSpeechStarted', false);
    store.set('_turnState', 'thinking');
    store.set('_lastInputTranscript', '');
    setTimeout(() => {
      if (store.get('toolCount') === 0) store.setState(STATE.IDLE);
    }, 100);
  }
}

export function handleWsMessage(event) {
  try {
    store.set('lastWsMessageTime', Date.now());
    const data = JSON.parse(event.data);
    if (data.toolCall) {
      _handleToolCall(data.toolCall.functionCalls);
      return;
    }
    if (data.setupComplete) {
      _handleSetupComplete();
      return;
    }
    if (data.serverContent) {
      _handleServerContent(data.serverContent).catch(e => _log('error', `serverContent handler: ${e.message}`));
    }
  } catch (e) {
    _log('error', `Error procesando WS message: ${e.message}`);
  }
}