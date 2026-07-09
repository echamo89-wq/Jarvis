import { store } from '../../state/store.js';
import { STATE } from '../../state/constants.js';
import { executeToolCall } from '../../tools/executor.js';
import { handleJarvisTextChunk, handleJarvisTranscriptInstant, appendUserMessage, _closeActiveJarvisBubble, _resetTurnState, showSystemErrorMessage, showChatStatus, hideChatStatus, updateInterimUserMessage, removeInterimUserMessage } from '../../chat/messages.js';
import { updateThinkingPanel } from '../../chat/text-processor.js';
// showTour is disabled because onboarding/index.js does not exist
const showTour = () => console.log('[TOUR] showTour called (not implemented)');
import { updateDiagnostics } from '../../chat/diagnostics.js';
import { playPCMChunk, stopAudioPlayback, playSystemSound } from '../../audio/playback.js';
import { autoCorrectSpanish } from '../../utils/autocorrect.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('WS-H');

let _pendingTranscript = null;
let _greetingSentThisSession = false;
let _lastUserEcho = '';
let _DOM = {};
function _q(id) { return _DOM[id] || (_DOM[id] = document.getElementById(id)); }
function _qs(sel) { return _DOM[sel] || (_DOM[sel] = document.querySelector(sel)); }
export function resetGreetingFlag() { _greetingSentThisSession = false; }

const MAX_RESPONSE_LENGTH = 10000;

function _cleanModelText(text) {
  if (!text || !text.trim()) return '';
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (text.length > MAX_RESPONSE_LENGTH + 1000) {
    text = text.substring(0, MAX_RESPONSE_LENGTH);
  }
  text = text.replace(/^\[Texto\]\s*/i, '');
  const dedup = (userMsg) => {
    if (!userMsg) return false;
    const tx = text.trim();
    if (tx.toLowerCase() === userMsg.toLowerCase()) return true;
    const idx = tx.toLowerCase().indexOf(userMsg.toLowerCase());
    if (idx === 0 || (idx < 5 && tx[idx - 1] === ' ')) {
      const stripped = tx.slice(idx + userMsg.length).replace(/^[,\s.!?]+/, '').trim();
      if (stripped) { text = stripped; return false; }
      return true;
    }
    return false;
  };
  const history = store.get('conversationHistory');
  if (history && history.length > 0) {
    const last = history[history.length - 1];
    if (last && last.role === 'user' && last.content) {
      if (dedup(last.content.trim())) return '';
    }
  }
  // Fallback: comparar con el último transcript grabado (cubre audio-only turns)
  if (_lastUserEcho && dedup(_lastUserEcho)) return '';
  text = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^\s*[|]\s*/gm, '')
    .trim();
  return text;
}

function _handleToolCall(calls) {
  _log('info', `[TOOLCALL] ${calls.length} herramienta(s): ${calls.map(c => c.name).join(', ')}`);
  store.set('toolCount', calls.length);
  store.set('lastSpeechDetectedTime', 0);
  store.set('lastTranscriptionTime', Date.now());
  showChatStatus('executing', calls.map(c => c.name).join(', '));
  const runTool = () => { executeToolCall(calls); };
  if (store.get('activeSources').length > 0) {
    _log('info', 'Esperando fin de audio antes de ejecutar herramientas...');
    let toolExecuted = false;
    const audioTimeout = setTimeout(() => { if (!toolExecuted) { toolExecuted = true; clearInterval(waitAudio); runTool(); } }, 3000);
    const waitAudio = setInterval(() => {
      if (!toolExecuted && store.get('activeSources').length === 0) {
        toolExecuted = true; clearInterval(waitAudio); clearTimeout(audioTimeout); runTool();
      }
    }, 100);
  } else { runTool(); }
}

function _handleSetupComplete() {
  updateDiagnostics('WS', 'CONECTADO');
  _log('info', '=== SETUP COMPLETADO ===');
  const sessionVal = _q('diag-session');
  if (sessionVal) { sessionVal.innerText = 'ACTIVO'; sessionVal.style.color = '#2ed573'; }
  const history = store.get('conversationHistory');
  const hasHistory = Array.isArray(history) && history.length > 0;
  if (!_greetingSentThisSession) {
    _greetingSentThisSession = true;
    playSystemSound('ready');
    if (hasHistory) {
      let turns = history.slice(-20).map(e => ({ role: e.role === 'user' ? 'user' : 'model', parts: [{ text: e.content }] }));
      while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
      while (turns.length > 0 && turns[turns.length - 1].role !== 'user') turns.pop();
      if (turns.length > 0) {
        window.ws.send(JSON.stringify({ clientContent: { turns, turnComplete: true } }));
        _log('info', `Historial restaurado: ${turns.length} mensajes (saludo omitido)`);
      }
    } else {
      _log('info', 'Sistemas listos — activando micrófono');
      setTimeout(() => {
        if (!store.get('micActive')) {
          import('../../audio/recorder.js').then(m => m.toggleMicrophone(true)).catch(() => {});
        }
      }, 800);
    }
    import('./manager.js').then(m => m.ensureAlwaysListening()).catch(() => {});
  }
  store.set('_userMsgShown', false);
}

function _handleServerContent(content) {
  if (content.interrupted) {
    _log('info', 'VAD interrupt — usuario habló, deteniendo respuesta');
    stopAudioPlayback();
    _closeActiveJarvisBubble();
    store.set('_jarvisSpeechStarted', false);
    store.set('_currentTurnTextBuffer', '');
    store.set('_turnState', 'thinking');
    removeInterimUserMessage();
  }
  if (store.get('waitingForResponse')) {
    const latency = store.get('micActive') && store.get('lastMicPacketTime') > 0
      ? Date.now() - store.get('lastMicPacketTime')
      : Date.now() - store.get('startTime');
    const latEl = _q('diag-latency');
    if (latEl) latEl.innerText = `${latency} ms`;
    const sidebarLat = _q('diag-latency-sidebar');
    if (sidebarLat) sidebarLat.innerText = `${latency} ms`;
    store.set('waitingForResponse', false);
    if (window.JarvisSupervisor) window.JarvisSupervisor.addLatency(latency);
  }
  if (content.inputTranscription?.text) {
    const newText = content.inputTranscription.text.trim();
    if (newText) {
      store.set('lastTranscriptionTime', Date.now());
      store.set('lastSpeechDetectedTime', 0);
      let accum = store.get('_inputAccum') || '';
      if (!accum) store.set('_inputAccum', newText);
      else if (newText.includes(accum)) store.set('_inputAccum', newText);
      else if (!accum.includes(newText)) store.set('_inputAccum', accum + ' ' + newText);
      const finalAccum = store.get('_inputAccum') || newText;
      if (finalAccum.length > newText.length) _lastUserEcho = finalAccum;
      else _lastUserEcho = newText;
      updateInterimUserMessage(finalAccum);
    }
  }
  if (content.outputTranscription?.text) {
    const chunk = content.outputTranscription.text;
    _log('info', `[TRANSCRIPT] ${chunk.substring(0, 80)}`);
    const prev = store.get('_jarvisSpeechText') || '';
    const sep = prev && !chunk.startsWith(' ') && !prev.endsWith(' ') ? ' ' : '';
    const newText = sep + chunk;
    const fullAccum = prev + newText;
    store.set('_jarvisSpeechText', fullAccum);
    _pendingTranscript = fullAccum;

    // Instant display — no typewriter so text tracks audio in real-time
    // Always update display with latest accumulated text
    const cleanedFull = _cleanModelText(fullAccum);
    if (cleanedFull) {
      if (!store.get('_turnTextShown')) {
        hideChatStatus();
        store.set('_turnTextShown', true);
      }
      handleJarvisTranscriptInstant(cleanedFull);
    }
  }
  if (content.modelTurn?.parts) {
    store.set('lastSpeechDetectedTime', 0);
    store.set('lastTranscriptionTime', Date.now());
    const rawText = (store.get('_inputAccum') || store.get('_lastUserTranscript') || '').trim();
    const correctedText = rawText ? autoCorrectSpanish(rawText) : '';
    const userText = correctedText || rawText;
    if (userText && userText !== store.get('_lastInputTranscript')) {
      store.set('_lastInputTranscript', userText);
      const wasVoice = !!(store.get('_inputAccum') || '').trim();
      if (wasVoice) {
        appendUserMessage(userText);
      } else {
        removeInterimUserMessage();
      }
      const isPromptRequest = /\b(prom|prompt)\b/i.test(userText);
      store.set('_silentTurn', !wasVoice || isPromptRequest);
      const history = store.get('conversationHistory');
      if (history.length > 200) history.splice(0, history.length - 200);
      history.push({ role: 'user', content: userText });
      store.set('conversationHistory', [...history]);
      if (window.JarvisSupervisor) window.JarvisSupervisor.record('user_msg', { text: userText.substring(0, 80) });
      const count = store.get('messageCount') + 1;
      store.set('messageCount', count);
      const msgCountEl = _q('diag-msg-count');
      if (msgCountEl) msgCountEl.innerText = `${count}`;
    } else {
      removeInterimUserMessage();
    }
    store.set('_inputAccum', '');
    store.set('_lastUserTranscript', '');
    const hasAudio = content.modelTurn.parts.some(p => p.inlineData?.data);
    if (hasAudio) store.set('_turnHasAudio', true);
    const silentMode = store.get('_silentTurn') || store.get('_textInputMode');
    content.modelTurn.parts.forEach(part => {
        if (part.text) {
          const text = part.text;
          const cleaned = _cleanModelText(text);
          if (part.thought === true) {
            const tb = _q('thinking-body');
            const currentText = tb ? (tb.innerText || '') : '';
            updateThinkingPanel(currentText + '\n' + text);
          }
          if (cleaned) {
            if (!store.get('_turnTextShown')) {
              hideChatStatus();
              _log('info', `[TEXT] ${cleaned.substring(0, 80)}`);
              store.set('_turnTextShown', true);
            }
            handleJarvisTextChunk(cleaned);
          }
        }
      if (part.inlineData?.data && store.get('focusMode') && !silentMode) playPCMChunk(part.inlineData.data);
    });
    _pendingTranscript = null;
  }
  if (content.turnComplete) {
    store.set('_turnHasAudio', false);
    store.set('_textInputMode', false);
    store.set('_silentTurn', false);
    _log('info', '=== TURNO COMPLETADO ===');
    hideChatStatus();
    removeInterimUserMessage();
    const jarvisSaid = store.get('_jarvisSpeechText');
    const _greetingText = (store.get('waitingForGreetingToFinish') && jarvisSaid) ? jarvisSaid : '';
    const _alreadyShown = store.get('_turnTextShown');
    store.set('_turnTextShown', false);
    if (!_alreadyShown) {
      if (jarvisSaid) {
        store.set('_currentTurnTextBuffer', '');
        const cleaned = _cleanModelText(jarvisSaid);
        if (cleaned) handleJarvisTextChunk(cleaned);
      } else if (_pendingTranscript) {
        store.set('_currentTurnTokenBuffer', '');
        handleJarvisTextChunk(_cleanModelText(_pendingTranscript));
      }
    }
    store.set('_jarvisSpeechText', '');
    _pendingTranscript = null;
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
      _log('info', `Saludo completado. Micrófono ${store.get('micActive') ? 'ya activo' : 'inactivo'}.`);
      store.set('_currentTurnTextBuffer', '');
      store.set('_jarvisSpeechStarted', false);
      store.set('_turnState', 'thinking');
      // Activar micrófono inmediatamente después del saludo
      if (!store.get('micActive')) {
        import('../../audio/recorder.js').then(m => m.toggleMicrophone(true)).catch(() => {});
      }
      setTimeout(() => showTour(), 800);
      return;
    }
    if (store.get('_turnState') === 'thinking') {
      const thinkingBody = _q('thinking-body');
      if (thinkingBody?.querySelector('.thinking-placeholder')) {
        thinkingBody.textContent = '';
        const pl = document.createElement('div');
        pl.className = 'thinking-placeholder';
        pl.textContent = 'Sin procesos activos.';
        thinkingBody.appendChild(pl);
      }
    }
    store.set('_currentTurnTextBuffer', '');
    store.set('_jarvisSpeechStarted', false);
    store.set('_turnState', 'thinking');
    store.set('_userMsgShown', false);
    store.set('_lastInputTranscript', '');
    store.set('_inputAccum', '');
    store.set('_lastUserTranscript', '');
    setTimeout(() => {
      if (store.get('toolCount') === 0) store.setState(store.get('micActive') ? STATE.LISTENING : STATE.IDLE);
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
      _handleServerContent(data.serverContent);
    }
  } catch (e) {
    _log('error', `Error procesando WS message: ${e.message}`);
  }
}
