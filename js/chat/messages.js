import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';
import { bus } from '../utils/event-bus.js';
import { autoCorrectSpanish } from '../utils/autocorrect.js';
import { addArtifact } from '../documents/artifacts.js';
import { _separateThinkingAndResponse, _convLog, extractCodeBlocks, _extractTitle, renderRichText } from './text-processor.js';

let _fadeTimer = null;
let _typewriterTarget = '';
let _typewriterIndex = 0;
let _typewriterTimer = null;
let _currentRole = null;

import { createLogger } from '../utils/logger.js';
const _log = createLogger('CHAT');

// ─── DOM helpers ─────────────────────────────────────────
function _getEls() {
  return {
    msgArea:    document.getElementById('message-area'),
    userPart:   document.getElementById('msg-user-part'),
    userText:   document.getElementById('msg-user-text'),
    jarvisPart: document.getElementById('msg-jarvis-part'),
    jarvisText: document.getElementById('msg-jarvis-text'),
    progArea:   document.getElementById('progress-area'),
    progSteps:  document.getElementById('progress-steps'),
    progPct:    document.getElementById('progress-pct'),
    progPctText:document.getElementById('prog-pct-text'),
    progPctFill:document.getElementById('prog-pct-fill'),
  };
}

// ─── Bubble visibility control ────────────────────────────
function _updateBubbleVisibility() {
  const els = _getEls();
  if (!els.msgArea) return;
  const hasUser   = els.userPart   && els.userPart.classList.contains('visible');
  const hasJarvis = els.jarvisPart && els.jarvisPart.classList.contains('visible');
  const indActive = document.getElementById('msg-indicator')?.classList.contains('active');

  if (hasUser || hasJarvis || indActive) {
    els.msgArea.classList.add('visible');
    const rv = document.querySelector('.reactor-viewport-area');
    if (rv) rv.classList.add('has-message');
  } else {
    els.msgArea.classList.remove('visible', 'revealed');
    const rv = document.querySelector('.reactor-viewport-area');
    if (rv) rv.classList.remove('has-message');
  }
}

// ─── Low-level text setters ───────────────────────────────
function _setUserText(text) {
  const els = _getEls();
  if (!els.userPart || !els.userText) return;
  els.userText.textContent = text;
  if (text) {
    els.userPart.classList.add('visible');
  } else {
    els.userPart.classList.remove('visible');
  }
  _updateBubbleVisibility();
}

function _setJarvisText(text) {
  const els = _getEls();
  if (!els.jarvisPart || !els.jarvisText) return;
  els.jarvisText.innerHTML = renderRichText(text);
  if (text) {
    els.jarvisPart.classList.add('visible');
  } else {
    els.jarvisPart.classList.remove('visible');
  }
  _updateBubbleVisibility();
}

// Show Jarvis label/section immediately (no text yet) so the bubble
// appears before the first character arrives.
function _showJarvisPanel() {
  const els = _getEls();
  if (!els.jarvisPart || !els.jarvisText) return;
  els.jarvisText.textContent = '';
  els.jarvisPart.classList.add('visible');
  _updateBubbleVisibility();
}

// ─── Activity indicator ───────────────────────────────────
function _updateIndicator(role) {
  const ind = document.getElementById('msg-indicator');
  if (!ind) return;
  ind.innerHTML = '';
  if (role === 'jarvis') {
    ind.className = 'msg-indicator active speaking';
    for (let i = 0; i < 3; i++) {
      const bar = document.createElement('span');
      bar.style.animationDelay = (i * 0.12) + 's';
      ind.appendChild(bar);
    }
  } else if (role === 'user') {
    ind.className = 'msg-indicator active';
  } else {
    ind.className = 'msg-indicator';
  }
  _updateBubbleVisibility();
}

function _clearMsg() {
  _setUserText('');
  _setJarvisText('');
  _showCopyButton(false);
  _updateIndicator('none');
}

function _fadeOutMsg(cb) {
  const el = document.getElementById('message-area');
  if (!el) { if (cb) cb(); return; }
  el.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1)';
  el.style.transform  = 'translateY(-4px) scale(0.98)';
  el.style.opacity    = '0';
  setTimeout(() => {
    el.classList.remove('visible', 'revealed');
    el.style.transform  = '';
    el.style.opacity    = '';
    if (cb) cb();
  }, 370);
}

export function _hideProgress(force = false) {
  const el = document.getElementById('progress-area');
  if (el) { el.classList.remove('visible'); el.style.display = 'none'; }
  import('../ui/task-bubble.js').then(m => m.hideTaskBubble(force));
}

// ─── Typewriter — smooth, never blocks ───────────────────
function _startTypewriter() {
  if (_typewriterTimer) return;
  const els = _getEls();
  if (els.jarvisText) els.jarvisText.classList.add('typing');
  _typewriterTimer = true;

  const BASE_INTERVAL = 4; // ms/char baseline

  let nextTime = performance.now() + BASE_INTERVAL;

  function _tick(now) {
    if (!_typewriterTimer) return;
    const e = _getEls().jarvisText;
    if (!e) { _typewriterTimer = null; return; }

    if (_typewriterIndex < _typewriterTarget.length) {
      // Catch up if chunks arrived faster than we rendered
      const elapsed = now - nextTime;
      const catchUp = Math.max(0, Math.floor(elapsed / BASE_INTERVAL));
      const add = 1 + catchUp;
      _typewriterIndex = Math.min(_typewriterIndex + add, _typewriterTarget.length);
      e.innerHTML = renderRichText(_typewriterTarget.substring(0, _typewriterIndex));

      // Ensure the panel is visible
      const part = _getEls().jarvisPart;
      if (part && !part.classList.contains('visible')) {
        part.classList.add('visible');
        _updateBubbleVisibility();
      }

      nextTime = now + BASE_INTERVAL;
      requestAnimationFrame(_tick);
    } else {
      e.classList.remove('typing');
      _typewriterTimer = null;
    }
  }
  requestAnimationFrame(_tick);
}

function _stopTypewriter() {
  _typewriterTimer = null;
  const els = _getEls();
  if (els.jarvisText) els.jarvisText.classList.remove('typing');
}

// ─── 2. USER — final confirmed message ───────────────────
export function appendUserMessage(rawText, correctedText) {
  if (!rawText || !rawText.trim()) return;
  const text = correctedText || rawText;
  _hideProgress(true);
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex  = 0;

  bus.emit('ui:links-hide');

  _convLog('conv_separator', '');
  _convLog('conv_user', text);

  // Clear Jarvis from previous turn; keep user text definitive
  _setJarvisText('');
  _setUserText(text);
  _updateIndicator('none');

  _log('info', `[USUARIO] ${text.substring(0, 100)}`);
}

export function handleJarvisTranscriptInstant(fullText) {
  if (!fullText || !fullText.trim()) return;
  if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
  _hideProgress();
  _stopTypewriter();           // stop any running typewriter
  _currentRole = 'jarvis';

  const els = _getEls();
  if (els.jarvisText) {
    const cleanText = fullText.replace(/<(?:think|thinking)>[\s\S]*?<\/\1>/gi, '').trim() || fullText;
    els.jarvisText.innerHTML = renderRichText(cleanText);
    els.jarvisText.className   = 'msg-text jarvis-text';
    els.jarvisText.classList.remove('typing');
  }
  if (els.jarvisPart) els.jarvisPart.classList.add('visible');
  _updateBubbleVisibility();
  _setupCopyButtonOnFinalText();

  _showCancelButton(true);

  store.set('_currentTurnTextBuffer', fullText);
  store.set('_turnState', 'responding');
}

// ─── 3b. JARVIS — typewriter (text-only response, no audio) ──
const MAX_DISPLAY_LENGTH = 8000;
export function handleJarvisTextChunk(chunk) {
  try {
    const toolCount = store.get('toolCount');
    let buffer = store.get('_currentTurnTextBuffer') || '';
    if (toolCount === 0) {
      if (buffer.length + chunk.length > MAX_DISPLAY_LENGTH) {
        chunk = chunk.substring(0, MAX_DISPLAY_LENGTH - buffer.length);
      }
      buffer += chunk;
    }
    store.set('_currentTurnTextBuffer', buffer);
    const split = _separateThinkingAndResponse(buffer);
    if (split.response && split.response.trim() !== '') {
      if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
      _hideProgress();

      if (_currentRole !== 'jarvis') {
        _currentRole = 'jarvis';
        // Show panel immediately so label appears before first character
        _showJarvisPanel();
        _typewriterTarget = split.response;
        _typewriterIndex  = 0;
        _startTypewriter();
        _showCancelButton(true);
      } else {
        // Update target — typewriter will catch up
        if (split.response.length > _typewriterTarget.length) {
          _typewriterTarget = split.response;
        }
        if (!_typewriterTimer) {
          _startTypewriter();
        }
      }
    }
    store.set('_turnState', 'responding');
  } catch (err) {
    _log('error', `handleJarvisTextChunk: ${err.message}`);
  }
}

// ─── 4. Progress helpers (Single Unified Task Bubble) ─────
export async function showProgressSteps(current, total, description) {
  const m = await import('../ui/task-bubble.js');
  if (current === 1) m.showTaskBubble(total);
  const state = current >= total ? 'done' : 'active';
  m.updateTask(current, description, state);
  if (current >= total) m.completeTaskBubble();
}

export async function showProgressStep(type, description, detail) {
  const m = await import('../ui/task-bubble.js');
  if (type === 'error') {
    m.taskErrorBubble((detail || description || 'Fallo de ejecución').substring(0, 80));
  } else {
    m.updateTask(1, `${description}${detail ? ': ' + detail : ''}`, type === 'success' ? 'done' : 'active');
  }
}

export async function showProgressPercent(pctValue) {
  const m = await import('../ui/task-bubble.js');
  const clamped = Math.min(Math.max(pctValue, 0), 100);
  m.updateTask(1, `Procesando: ${clamped}%`, clamped >= 100 ? 'done' : 'active');
}

export function hideProgress() { _hideProgress(); }

// ─── 5. Greeting ─────────────────────────────────────────
function _getUserAddress() {
  const title = localStorage.getItem('jarvis_title') || '';
  const name  = localStorage.getItem('jarvis_username') || '';
  if (title && name) return `${title} ${name}`;
  if (name) return name;
  return 'señor';
}

export function showInstantGreeting() {
  const address = _getUserAddress();
  const cached  = localStorage.getItem('jarvis_cached_greeting') || `Sistemas en línea, ${address}.`;
  _hideProgress();
  _setUserText('');
  _setJarvisText(cached);
}

export function sendInitialGreetingRequest() {
  const addressName = _getUserAddress();
  store.set('waitingForGreetingToFinish', true);
  const history = store.get('conversationHistory');
  const turns = (history || []).slice(-20).map(e => ({ role: e.role === 'user' ? 'user' : 'model', parts: [{ text: e.content }] }));
  turns.push({ role: 'user', parts: [{ text: `Di SOLO el saludo, máximo 4 palabras, en español, a: '${addressName}'. NO expliques, NO pienses en voz alta, NO uses comillas.` }] });
  const greetMsg = { clientContent: { turns, turnComplete: true } };
  const ws = window.ws;
  if (ws) ws.send(JSON.stringify(greetMsg));
}

// ─── 6. Turn reset ───────────────────────────────────────
export function _resetTurnState() {
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex  = 0;
  _currentRole      = null;
  _setUserText('');
  _setJarvisText('');
  _updateIndicator('none');
  _showCopyButton(false);
  _showCancelButton(false);
  _hideProgress();
  if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
  bus.emit('ui:links-hide');
  store.set('_currentTurnTextBuffer', '');
  store.set('_turnState', 'thinking');
  store.set('_thinkingPhaseStartTime', Date.now());
}

// ─── 6.5 Cancel response ─────────────────────────────────
export function cancelCurrentResponse() {
  import('../audio/playback.js').then(async ({ stopAudioPlayback }) => {
    stopAudioPlayback();
    _stopTypewriter();
    _typewriterTarget = '';
    _typewriterIndex = 0;
    _currentRole = null;
    _setUserText('');
    _setJarvisText('');
    _updateIndicator('none');
    _showCopyButton(false);
    _hideProgress();
    if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
    store.set('_currentTurnTextBuffer', '');
    store.set('_turnState', 'thinking');
    store.set('_jarvisSpeechStarted', false);
    store.set('_turnTextShown', false);
    store.set('toolCount', 0);
    _log('info', 'Respuesta cancelada por el usuario');
    // Detener grabación de micrófono para que no mande PCM a la nueva conexión
    import('../audio/recorder.js').then(m => m.stopRecording()).catch(() => {});
    // Reconectar WebSocket — connectWebSocket ya limpia el proxy y cierra la WS anterior
    try {
      const { connectWebSocket } = await import('../Core/Connection/manager.js');
      store.set('isReconnectingIntentional', true);
      await connectWebSocket();
    } catch (e) {
      _log('warn', `Cancel reconnect: ${e.message}`);
    }
  });
}

// ─── 7. Close active Jarvis bubble (turn complete) ───────
export function _closeActiveJarvisBubble() {
  _stopTypewriter();
  const els    = _getEls();
  const buffer = store.get('_currentTurnTextBuffer') || '';
  const split  = _separateThinkingAndResponse(buffer);
  const finalText = split.response || _typewriterTarget || (els.jarvisText?.textContent?.trim() || '');

  if (finalText && els.jarvisText) {
    els.jarvisText.innerHTML = renderRichText(finalText);
    if (els.jarvisPart) els.jarvisPart.classList.add('visible');
    _updateBubbleVisibility();
    _setupCopyButtonOnFinalText();
  }

  const history = store.get('conversationHistory');
  const displayText = els.jarvisText?.textContent?.trim();
  if (displayText) {
    history.push({ role: 'model', content: displayText });
    store.set('conversationHistory', [...history]);
  }
  if (displayText && displayText.length > 3) {
    _convLog('conv_response', displayText.substring(0, 500));
  }

  // Extract code/document artifacts
  let docCount = 0;
  const codeBlocks = extractCodeBlocks(buffer);
  for (const block of codeBlocks) {
    addArtifact(block.code, block.lang, block.title);
    docCount++;
  }
  const bodyText = buffer.replace(/```[\s\S]*?```/g, '').trim();
  if (bodyText.length > 300 && bodyText.split(/\s+/).length > 40) {
    addArtifact(bodyText, 'markdown', _extractTitle(bodyText));
    docCount++;
  }
  if (docCount > 0) {
    const indicator = document.getElementById('msg-code-indicator');
    if (indicator) {
      indicator.textContent = `📄 ${docCount} doc${docCount > 1 ? 's' : ''} creado${docCount > 1 ? 's' : ''}`;
      indicator.style.display = 'inline';
      setTimeout(() => { indicator.style.display = 'none'; }, 4000);
    }
  }

  store.set('_currentTurnTextBuffer', '');
  store.set('_turnState', 'thinking');
  _showCancelButton(false);

  // Auto-fade after 15s inactivity
  if (_fadeTimer) clearTimeout(_fadeTimer);
  _fadeTimer = setTimeout(() => {
    _fadeOutMsg(() => _clearMsg());
  }, 15000);
}

// ─── Cancel button setup ──────────────────────────────
let _escHandlerRef = null;
function _setupCancelButton() {
  const btn = document.getElementById('msg-cancel-btn');
  if (!btn) return;
  // Remove old listener by cloning
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => cancelCurrentResponse());
  // Escape key to cancel — keep reference to avoid listener leak
  if (_escHandlerRef) {
    document.removeEventListener('keydown', _escHandlerRef);
  }
  _escHandlerRef = (e) => {
    if (e.key === 'Escape' && store.get('_turnState') === 'responding') {
      cancelCurrentResponse();
    }
  };
  document.addEventListener('keydown', _escHandlerRef);
}

// Show cancel button when Jarvis is responding
function _showCancelButton(show) {
  const btn = document.getElementById('msg-cancel-btn');
  if (btn) {
    btn.style.display = show ? 'inline-block' : 'none';
    _setupCancelButton();
  }
}

// ─── Copy button for Jarvis responses ──────────────────
function _getCopyBtn() {
  let btn = document.getElementById('msg-copy-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'msg-copy-btn';
    btn.className = 'msg-copy-btn';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">Copiar</span>';
    btn.title = 'Copiar respuesta';
    btn.style.display = 'none';
    const buttonsContainer = document.getElementById('msg-buttons');
    const jarvisPart = document.getElementById('msg-jarvis-part');
    if (buttonsContainer) {
      buttonsContainer.prepend(btn);
    } else if (jarvisPart) {
      jarvisPart.appendChild(btn);
    }
    btn.addEventListener('click', () => {
      const text = document.getElementById('msg-jarvis-text')?.textContent || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const label = btn.querySelector('.copy-label');
        if (label) {
          label.textContent = '✓ Copiado';
          btn.style.borderColor = 'rgba(0, 255, 136, 0.4)';
          btn.style.color = '#00ff88';
          setTimeout(() => { 
            label.textContent = 'Copiar'; 
            btn.style.borderColor = '';
            btn.style.color = '';
          }, 2000);
        }
      }).catch(() => {});
    });
  }
  return btn;
}

function _showCopyButton(show) {
  const btn = _getCopyBtn();
  btn.style.display = show ? 'inline-flex' : 'none';
}

function _setupCopyButtonOnFinalText() {
  const text = document.getElementById('msg-jarvis-text')?.textContent?.trim();
  _showCopyButton(text && text.length > 0);
}

// ─── 8. System error ─────────────────────────────────────
export function showSystemErrorMessage(text) {
  if (!text) return;
  _hideProgress();
  _setUserText('');
  _setJarvisText(text);
  _updateIndicator('none');
  _convLog('conv_response', '⚠ ' + text.substring(0, 200));
  if (_fadeTimer) clearTimeout(_fadeTimer);
  const isCritical = /error|fall[óo]|conexi[oó]n/i.test(text);
  if (!isCritical) {
    _fadeTimer = setTimeout(() => _fadeOutMsg(() => _clearMsg()), 8000);
  }
}

export function appendSystemMessage(text) { showSystemErrorMessage(text); }

// ─── Stubs / Compat exports ───────────────────────────────
export function appendJarvisMessage(text) {
  if (!text || !text.trim()) return;
  _hideProgress();
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex  = 0;
  _setUserText('');
  _setJarvisText(text);
  _log('info', text.substring(0, 100));
}

export function appendCommandResult(title, output) {
  if (!output) return;
  _hideProgress();
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex  = 0;
  const text = `[${title}]\n${output.substring(0, 1000)}`;
  _setUserText('');
  _setJarvisText(text);
  const els = _getEls();
  if (els.jarvisPart) {
    const lbl = els.jarvisPart.querySelector('.msg-label');
    if (lbl) lbl.textContent = '⚙ SISTEMA';
  }
  _convLog('conv_separator', '');
  _convLog('conv_response', '⚙ ' + title + ': ' + output.substring(0, 200));
  if (_fadeTimer) clearTimeout(_fadeTimer);
  _fadeTimer = setTimeout(() => {
    _fadeOutMsg(() => {
      _clearMsg();
      const e2 = _getEls();
      if (e2.jarvisPart) {
        const lbl = e2.jarvisPart.querySelector('.msg-label');
        if (lbl) lbl.textContent = 'JARVIS';
      }
    });
  }, 15000);
}

export function hideChatStatus() {}
export function showChatStatus(phase, detail) {
  showProgressStep('info', `Ejecutando: ${phase}`, detail || '');
}
export function showDoneStatus(count) {
  if (count > 0) showProgressStep('success', 'Completado', `${count} herramienta(s) ejecutada(s)`);
}
// ─── Text input send ──────────────────────────────────────
export function sendTextMessage() {
  const textInput = document.getElementById('text-input');
  const text = textInput?.value?.trim();
  if (!text) return;

  // Slash commands
  if (text === '/debug') {
    import('../Core/Connection/handler.js').then(m => {
      const newMode = !localStorage.getItem('jarvis_debug');
      m.setDebugMode(newMode);
      if (newMode) localStorage.setItem('jarvis_debug', '1');
      else localStorage.removeItem('jarvis_debug');
      textInput.value = '';
      appendSystemMessage(newMode ? 'Modo debug ACTIVADO — todos los detalles se muestran en la terminal.' : 'Modo debug DESACTIVADO.');
    });
    return;
  }
  if (text === '/history') {
    const h = store.get('conversationHistory') || [];
    textInput.value = '';
    appendSystemMessage(`Historial: ${h.length} entradas. Revisá la terminal para más detalles.`);
    console.table(h.map(e => ({ role: e.role, content: (e.content || '').substring(0, 60) })));
    return;
  }

  const correctedText = autoCorrectSpanish(text);
  const displayText   = correctedText || text;

  import('../audio/playback.js').then(async ({ stopAudioPlayback }) => {
    stopAudioPlayback();
    _resetTurnState();
    appendUserMessage(text, correctedText !== text ? correctedText : '');
    _log('info', `[TEXTO ENVIADO] "${text}"${correctedText ? ' → "' + correctedText + '"' : ''}`);

    const count = store.get('messageCount') + 1;
    store.set('messageCount', count);
    const msgCountEl = document.getElementById('diag-msg-count');
    if (msgCountEl) msgCountEl.innerText = `${count}`;
    textInput.value = '';
    store.set('startTime', Date.now());
    store.set('waitingForResponse', true);

    // ── ROUTING DE TEXTO ─────────────────────────────────────────────────
    // Prioridad 1: WebSocket de Gemini Live (si está conectado)
    const ws = window.ws;
    if (ws && ws.readyState === 1) {
      const history = store.get('conversationHistory');
      history.push({ role: 'user', content: displayText });
      store.set('conversationHistory', [...history]);
      const turns = history.slice(-40).map(e => ({
        role: e.role === 'model' ? 'model' : 'user',
        parts: [{ text: e.content }]
      }));
      try {
        ws.send(JSON.stringify({
          clientContent: { turns, turnComplete: true }
        }));
        return;
      } catch (wsErr) {
        _log('warn', `WS text send falló, intentando proveedor local: ${wsErr.message}`);
      }
    }

    // Prioridad 3: REST API de Gemini (fallback si WS caído y proveedor es gemini)
    store.set('_textInputMode', true);
    const historyRest = store.get('conversationHistory');
    historyRest.push({ role: 'user', content: displayText });
    store.set('conversationHistory', [...historyRest]);
    const apiMessages = historyRest.slice(-40).map(e => ({
      role: e.role === 'model' ? 'model' : 'user',
      parts: [{ text: e.content }]
    }));
    let responseText = '';
    try {
      if (window.electronAPI?.geminiTextChat) {
        const result = await window.electronAPI.geminiTextChat({ messages: apiMessages, systemInstruction: '' });
        if (result.success) {
          responseText = result.response;
        } else {
          throw new Error(result.error || 'Error en la API de Gemini');
        }
      } else {
        throw new Error('geminiTextChat no disponible');
      }
    } catch (err) {
      _log('error', `Error en geminiTextChat: ${err.message}`);
      showSystemErrorMessage(`Error al comunicarse con Gemini: ${err.message}`);
      store.set('waitingForResponse', false);
      return;
    }
    if (responseText) {
      const { cleanModelText } = await import('../Core/Connection/handler.js');
      const cleaned = cleanModelText(responseText);
      if (cleaned) {
        historyRest.push({ role: 'model', content: cleaned });
        store.set('conversationHistory', [...historyRest]);
        handleJarvisTextChunk(cleaned);
        _log('info', `[TEXT] ${cleaned.substring(0, 80)}`);
      }
    }
    store.set('waitingForResponse', false);
    store.set('_textInputMode', false);
    store.set('_turnState', 'thinking');
    setTimeout(() => {
      if (store.get('toolCount') === 0) store.setState(STATE.IDLE);
    }, 100);

  });
}