import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';
import { bus } from '../utils/event-bus.js';
import { autoCorrectSpanish } from '../utils/autocorrect.js';
import { addArtifact } from '../documents/artifacts.js';
import { _separateThinkingAndResponse, updateThinkingPanel, _convLog, extractCodeBlocks, _extractTitle } from './text-processor.js';

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
  const hasUser   = els.userPart   && els.userPart.style.display   === 'block';
  const hasJarvis = els.jarvisPart && els.jarvisPart.style.display === 'block';
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
  els.userPart.style.display = text ? 'block' : 'none';
  _updateBubbleVisibility();
}

function _setJarvisText(text) {
  const els = _getEls();
  if (!els.jarvisPart || !els.jarvisText) return;
  els.jarvisText.textContent = text;
  els.jarvisPart.style.display = text ? 'block' : 'none';
  _updateBubbleVisibility();
}

// Show Jarvis label/section immediately (no text yet) so the bubble
// appears before the first character arrives.
function _showJarvisPanel() {
  const els = _getEls();
  if (!els.jarvisPart || !els.jarvisText) return;
  els.jarvisText.textContent = '';
  els.jarvisPart.style.display = 'block';
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

export function _hideProgress() {
  const el = document.getElementById('progress-area');
  if (el) { el.classList.remove('visible'); el.style.display = 'none'; }
  import('../ui/task-bubble.js').then(m => m.hideTaskBubble());
}

// ─── Typewriter — smooth, never blocks ───────────────────
function _startTypewriter() {
  if (_typewriterTimer) return;
  const els = _getEls();
  if (els.jarvisText) els.jarvisText.classList.add('typing');
  _typewriterTimer = true;

  const BASE_INTERVAL = 12; // ms/char baseline

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
      e.textContent = _typewriterTarget.substring(0, _typewriterIndex);

      // Ensure the panel is visible
      const part = _getEls().jarvisPart;
      if (part && part.style.display !== 'block') {
        part.style.display = 'block';
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

// ─── 1. USER — interim (real-time voice transcription) ───
export function updateInterimUserMessage(text) {
  if (!text || !text.trim()) return;
  _hideProgress();
  // Only clear Jarvis text on the FIRST interim of a new turn
  // (when Jarvis part is empty or it's a fresh turn)
  const els = _getEls();
  const jarvisHasText = els.jarvisText && els.jarvisText.textContent.trim().length > 0;
  if (!jarvisHasText) {
    _setJarvisText('');
  }
  _setUserText(text + '…');
  _updateIndicator('user');
}

// ─── 2. USER — final confirmed message ───────────────────
export function appendUserMessage(rawText, correctedText) {
  if (!rawText || !rawText.trim()) return;
  const text = correctedText || rawText;
  _hideProgress();
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex  = 0;

  _convLog('conv_separator', '');
  _convLog('conv_user', text);

  // Clear Jarvis from previous turn; keep user text definitive
  _setJarvisText('');
  _setUserText(text);
  _updateIndicator('none');

  _log('info', `[USUARIO] ${text.substring(0, 100)}`);
}

export function removeInterimUserMessage() {
  const els = _getEls();
  if (els.userPart && els.userPart.style.display === 'block') {
    // Only clear the '…' interim if user text is still interim
    const t = els.userText?.textContent || '';
    if (t.endsWith('…')) {
      _setUserText('');
      _updateIndicator('none');
    }
  }
}

// ─── 3a. JARVIS — INSTANT display (voice output transcription) ────
// Called with the FULL accumulated transcription text so far.
// No typewriter — keeps pace with the audio stream.
export function handleJarvisTranscriptInstant(fullText) {
  if (!fullText || !fullText.trim()) return;
  if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
  _hideProgress();
  _stopTypewriter();           // stop any running typewriter
  _currentRole = 'jarvis';

  const els = _getEls();
  if (els.jarvisText) {
    els.jarvisText.textContent = fullText;
    els.jarvisText.className   = 'msg-text jarvis-text';
    els.jarvisText.classList.remove('typing');
  }
  if (els.jarvisPart) els.jarvisPart.style.display = 'block';
  _updateBubbleVisibility();

  store.set('_turnState', 'responding');
}

// ─── 3b. JARVIS — typewriter (text-only response, no audio) ──
export function handleJarvisTextChunk(chunk) {
  try {
    const toolCount = store.get('toolCount');
    let buffer = store.get('_currentTurnTextBuffer') || '';
    if (toolCount === 0) buffer += chunk;
    store.set('_currentTurnTextBuffer', buffer);
    const split = _separateThinkingAndResponse(buffer);
    updateThinkingPanel(split.thinking);

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

// ─── 4. Progress helpers ──────────────────────────────────
export async function showProgressSteps(current, total, description) {
  const m = await import('../ui/task-bubble.js');
  if (current === 1) m.showTaskBubble(total);
  const state = current > 1 ? 'done' : 'active';
  m.updateTask(current, description, state);
  if (current >= total) setTimeout(() => m.completeTaskBubble(), 500);
}

export function showProgressStep(type, description, detail) {
  const els = _getEls();
  if (!els.progArea) return;
  if (_currentRole === 'jarvis') return;
  els.progArea.style.display = 'flex';
  els.progArea.classList.add('visible');
  els.progSteps.style.display = 'flex';
  if (els.progPct) els.progPct.style.display = 'none';

  const step = document.createElement('div');
  step.className = 'prog-step ' + type;
  step.style.cssText = 'opacity:0;transform:translateY(4px)';
  const icons = { info:'○', warning:'▲', success:'✓', error:'✗' };
  const span = document.createElement('span');
  span.className = 'step-icon';
  span.textContent = icons[type] || '○';
  step.appendChild(span);
  const desc = document.createElement('span');
  desc.className = 'step-desc';
  desc.textContent = description;
  step.appendChild(desc);
  if (detail) {
    const det = document.createElement('span');
    det.className = 'step-detail';
    det.textContent = detail;
    step.appendChild(det);
  }
  els.progSteps.textContent = '';
  els.progSteps.appendChild(step);
  requestAnimationFrame(() => {
    step.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    step.style.opacity    = '1';
    step.style.transform  = 'translateY(0)';
  });
}

export function showProgressPercent(pctValue) {
  const els = _getEls();
  if (!els.progArea) return;
  if (_currentRole === 'jarvis') return;
  els.progArea.style.display = 'flex';
  els.progArea.classList.add('visible');
  els.progPct.style.display = 'flex';
  if (els.progSteps) els.progSteps.style.display = 'none';
  const clamped = Math.min(Math.max(pctValue, 0), 100);
  if (els.progPctText) els.progPctText.textContent = clamped + '%';
  if (els.progPctFill) els.progPctFill.style.width = clamped + '%';
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
  _hideProgress();
  if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
  store.set('_currentTurnTextBuffer', '');
  store.set('_turnState', 'thinking');
  store.set('_thinkingPhaseStartTime', Date.now());
  updateThinkingPanel('');
}

// ─── 7. Close active Jarvis bubble (turn complete) ───────
export function _closeActiveJarvisBubble() {
  _stopTypewriter();
  const els    = _getEls();
  const buffer = store.get('_currentTurnTextBuffer') || '';
  const split  = _separateThinkingAndResponse(buffer);
  const finalText = split.response || _typewriterTarget || (els.jarvisText?.textContent?.trim() || '');

  if (finalText && els.jarvisText) {
    els.jarvisText.textContent = finalText;
    els.jarvisText.className   = 'msg-text jarvis-text';
    els.jarvisText.classList.remove('typing');
    if (els.jarvisPart) els.jarvisPart.style.display = 'block';
    _updateBubbleVisibility();
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
  updateThinkingPanel('');

  // Auto-fade after 15s inactivity
  if (_fadeTimer) clearTimeout(_fadeTimer);
  _fadeTimer = setTimeout(() => {
    _fadeOutMsg(() => _clearMsg());
  }, 15000);
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
export function appendVoiceNote() {}

// ─── Text input send ──────────────────────────────────────
export function sendTextMessage() {
  const textInput = document.getElementById('text-input');
  const text = textInput?.value?.trim();
  if (!text) return;

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

    const activeProvider = store.get('_activeProvider') || 'gemini';
    if (activeProvider !== 'gemini') {
      const { sendProviderMessage } = await import('../engines/provider-chat.js');
      const history = store.get('conversationHistory');
      history.push({ role: 'user', content: displayText });
      store.set('conversationHistory', [...history]);
      const result = await sendProviderMessage(displayText);
      if (result.response) {
        history.push({ role: 'model', content: result.response });
        store.set('conversationHistory', [...history]);
        handleJarvisTextChunk(result.response);
      }
      store.set('waitingForResponse', false);
      return;
    }

    let ws = window.ws;
    if (!ws || ws.readyState !== 1) {
      const mm = await import('../system/model-manager.js');
      if (mm.getMode() === 'local') {
        const history = store.get('conversationHistory');
        history.push({ role: 'user', content: displayText });
        store.set('conversationHistory', [...history]);
        return;
      }
      _log('info', 'WS cerrado — reconectando');
      const { connectWebSocket } = await import('../Core/Connection/manager.js');
      await connectWebSocket();
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (window.ws?.readyState === 1) break;
      }
      ws = window.ws;
      if (!ws || ws.readyState !== 1) { showSystemErrorMessage('No se pudo reconectar.'); return; }
    }

    const history = store.get('conversationHistory');
    const allTurns = (history || []).slice(-40).map(e => ({ role: e.role === 'user' ? 'user' : 'model', parts: [{ text: e.content }] }));
    allTurns.push({ role: 'user', parts: [{ text: '[Texto] ' + displayText }] });
    ws.send(JSON.stringify({
      clientContent: { turns: allTurns, turnComplete: true }
    }));
    _log('info', 'Mensaje de texto enviado');
  });
}