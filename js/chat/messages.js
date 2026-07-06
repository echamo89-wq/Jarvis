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

function _getEls() {
  return {
    msgArea: document.getElementById('message-area'),
    msgText: document.getElementById('msg-text'),
    msgLabel: document.getElementById('msg-label'),
    progArea: document.getElementById('progress-area'),
    progSteps: document.getElementById('progress-steps'),
    progPct: document.getElementById('progress-pct'),
    progPctText: document.getElementById('prog-pct-text'),
    progPctFill: document.getElementById('prog-pct-fill'),
  };
}

function _setMsg(label, text, role) {
  const els = _getEls();
  if (els.msgLabel) { els.msgLabel.textContent = label; els.msgLabel.className = 'msg-label ' + role; }
  if (els.msgText) { els.msgText.textContent = text; els.msgText.className = 'msg-text ' + role; }
  if (els.msgArea) {
    els.msgArea.className = 'message-area ' + role;
    els.msgArea.classList.add('visible');
    requestAnimationFrame(() => {
      els.msgArea.style.transform = '';
      els.msgArea.style.opacity = '';
      els.msgArea.classList.add('revealed');
    });
  }
  const rv = document.querySelector('.reactor-viewport-area');
  if (rv) rv.classList.add('has-message');
  _currentRole = role;
  import('../weather/forecast-panel.js').then(m => m.hideWeatherForecast()).catch(() => {});
  import('../ui/info-panel.js').then(m => m.hideInfoPanel()).catch(() => {});
  _updateIndicator(role);
}

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
}

function _clearMsg() {
  const els = _getEls();
  if (els.msgText) { els.msgText.textContent = ''; els.msgText.className = 'msg-text'; }
  if (els.msgLabel) { els.msgLabel.textContent = ''; els.msgLabel.className = 'msg-label'; }
  if (els.msgArea) els.msgArea.classList.remove('visible');
  const rv = document.querySelector('.reactor-viewport-area');
  if (rv) rv.classList.remove('has-message');
  _currentRole = null;
}

function _fadeOutMsg(cb) {
  const el = document.getElementById('message-area');
  if (!el) { if (cb) cb(); return; }
  el.classList.remove('visible');
  el.style.transform = 'translateY(-3px) scale(0.98)';
  el.style.opacity = '0';
  setTimeout(() => { if (cb) cb(); }, 120);
}

export function _hideProgress() {
  const el = document.getElementById('progress-area');
  if (el) { el.classList.remove('visible'); el.style.display = 'none'; }
  import('../ui/task-bubble.js').then(m => m.hideTaskBubble());
}

// ─── Typewriter rápido ─────────────────────────────────
function _startTypewriter() {
  if (_typewriterTimer) return;
  const els = _getEls();
  if (els.msgText) els.msgText.classList.add('typing');
  const _indicator = document.getElementById('msg-indicator');
  _typewriterTimer = true;

  function _charInterval() {
    return 10 + Math.random() * 6;
  }

  let nextCharTime = 0;
  function _tick(now) {
    if (!_typewriterTimer) return;
    const e = _getEls().msgText;
    if (!e) return;
    if (_typewriterIndex < _typewriterTarget.length) {
      if (now >= nextCharTime) {
        const charsToAdd = Math.min(
          Math.floor((now - nextCharTime) / _charInterval()) + 1,
          _typewriterTarget.length - _typewriterIndex
        );
        _typewriterIndex += charsToAdd;
        e.textContent = _typewriterTarget.substring(0, _typewriterIndex);
        nextCharTime = now + _charInterval();
        if (_indicator) _indicator.classList.add('typing');
      }
      requestAnimationFrame(_tick);
    } else {
      e.classList.remove('typing');
      _typewriterTimer = null;
      if (_indicator) _indicator.classList.remove('typing');
    }
  }
  nextCharTime = performance.now() + 20;
  requestAnimationFrame(_tick);
}

function _stopTypewriter() {
  if (_typewriterTimer) {
    _typewriterTimer = null;
  }
  const els = _getEls();
  if (els.msgText) els.msgText.classList.remove('typing');
}

// ─── 1. User message ─────────────────────────────────────
export function appendUserMessage(rawText, correctedText) {
  if (!rawText || !rawText.trim()) return;
  const text = correctedText || rawText;
  _hideProgress();
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex = 0;

  _convLog('conv_separator', '');
  _convLog('conv_user', text);

  _fadeOutMsg(() => {
    _setMsg('▶ TÚ', text, 'user');
  });
  _log('info', `[USUARIO] ${text.substring(0, 100)}`);
}

export function updateInterimUserMessage(text) {
  if (!text || !text.trim()) return;
  _hideProgress();
  const els = _getEls();
  if (els.msgText && els.msgArea?.classList.contains('visible') && _currentRole === 'user') {
    els.msgText.textContent = text + '…';
  } else {
    _setMsg('▶ TÚ', text + '…', 'user');
  }
}

export function removeInterimUserMessage() {
  const els = _getEls();
  if (els.msgText && els.msgLabel && _currentRole === 'user') {
    els.msgText.textContent = '';
    els.msgLabel.textContent = '';
  }
}

// ─── 2. JARVIS streaming response ────────────────────────
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
      if (_currentRole !== 'jarvis') {
        _hideProgress();
        _fadeOutMsg(() => {
          _setMsg('JARVIS', '', 'jarvis');
          _typewriterTarget = split.response;
          _typewriterIndex = 0;
          _startTypewriter();
        });
      } else {
        if (split.response.length > _typewriterTarget.length) {
          _typewriterTarget = split.response;
        }
        if (!_typewriterTimer) {
          _typewriterIndex = 0;
          _startTypewriter();
        }
      }
    }
    store.set('_turnState', 'responding');
  } catch (err) {
    _log('error', `handleJarvisTextChunk: ${err.message}`);
  }
}

// ─── 3. Progress modes ───────────────────────────────────
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

  const icons = { info: '○', warning: '▲', success: '✓', error: '✗' };
  const icon = icons[type] || '○';
  const dotClass = type === 'active' ? 'step-dot' : (['warning','success','error'].includes(type) ? `step-dot ${type}` : '');

  const step = document.createElement('div');
  step.className = 'prog-step ' + type;
  step.style.opacity = '0';
  step.style.transform = 'translateY(4px)';
  if (dotClass) {
    const span = document.createElement('span');
    span.className = dotClass;
    step.appendChild(span);
  } else {
    const span = document.createElement('span');
    span.className = 'step-icon';
    span.textContent = icon;
    step.appendChild(span);
  }
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
    step.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
    step.style.opacity = '1';
    step.style.transform = 'translateY(0)';
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

export function hideProgress() {
  _hideProgress();
}

// ─── 4. Greeting ─────────────────────────────────────────
function _getUserAddress() {
  const title = localStorage.getItem('jarvis_title') || '';
  const name = localStorage.getItem('jarvis_username') || '';
  if (title && name) return `${title} ${name}`;
  if (name) return name;
  return 'señor';
}

export function showInstantGreeting() {
  const address = _getUserAddress();
  const cached = localStorage.getItem('jarvis_cached_greeting') || `Sistemas en línea, ${address}.`;
  _hideProgress();
  _fadeOutMsg(() => {
    _setMsg('JARVIS', cached, 'jarvis');
  });
}

export function sendInitialGreetingRequest() {
  const addressName = _getUserAddress();
  store.set('waitingForGreetingToFinish', true);
  const greetMsg = {
    clientContent: {
      turns: [{ role: 'user', parts: [{ text: `Di SOLO el saludo, máximo 4 palabras, en español, a: '${addressName}'. NO expliques, NO pienses en voz alta, NO uses comillas.` }] }],
      turnComplete: true
    }
  };
  const ws = window.ws;
  if (ws) ws.send(JSON.stringify(greetMsg));
}

// ─── 5. Reset ────────────────────────────────────────────
export function _resetTurnState() {
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex = 0;
  _currentRole = null;
  const els = _getEls();
  if (els.msgText) { els.msgText.textContent = ''; els.msgText.className = 'msg-text'; }
  if (els.msgLabel) { els.msgLabel.textContent = ''; els.msgLabel.className = 'msg-label'; }
  if (els.msgArea) els.msgArea.classList.remove('visible');
  _hideProgress();
  if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
  store.set('_currentTurnTextBuffer', '');
  store.set('_turnState', 'thinking');
  store.set('_thinkingPhaseStartTime', Date.now());
  updateThinkingPanel('');
}

// ─── 6. Error messages ───────────────────────────────────
export function showSystemErrorMessage(text) {
  if (!text) return;
  _hideProgress();
  _fadeOutMsg(() => {
    _setMsg('⚠ SISTEMA', text, 'jarvis');
  });
  _convLog('conv_response', '⚠ ' + text.substring(0, 200));
  if (_fadeTimer) clearTimeout(_fadeTimer);
  const isCritical = /error|fall[óo]|conexi[oó]n/i.test(text);
  if (!isCritical) {
    _fadeTimer = setTimeout(() => {
      _fadeOutMsg(() => {});
    }, 8000);
  }
}

export function appendSystemMessage(text) { showSystemErrorMessage(text); }

// ─── Stubs ───────────────────────────────────────────────
export function appendJarvisMessage(text) {
  if (!text || !text.trim()) return;
  _hideProgress();
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex = 0;
  _fadeOutMsg(() => {
    _setMsg('JARVIS', text, 'jarvis');
  });
  _log('info', text.substring(0, 100));
}

export function _closeActiveJarvisBubble() {
  _stopTypewriter();
  const els = _getEls();
  const buffer = store.get('_currentTurnTextBuffer') || '';
  const split = _separateThinkingAndResponse(buffer);
  const finalText = split.response || _typewriterTarget || '';
  if (els.msgText && finalText) {
    els.msgText.textContent = finalText;
    els.msgText.className = 'msg-text jarvis';
    els.msgText.classList.remove('typing');
  }
  const history = store.get('conversationHistory');
  const text = els.msgText?.textContent?.trim();
  if (text) {
    history.push({ role: 'model', content: text });
    store.set('conversationHistory', [...history]);
  }

  if (text && text.length > 3) {
    _convLog('conv_response', text.substring(0, 500));
  }

  let docCount = 0;

  const codeBlocks = extractCodeBlocks(buffer);
  for (const block of codeBlocks) {
    addArtifact(block.code, block.lang, block.title);
    docCount++;
  }

  const bodyText = buffer.replace(/```[\s\S]*?```/g, '').trim();
  if (bodyText.length > 300 && bodyText.split(/\s+/).length > 40) {
    const title = _extractTitle(bodyText);
    addArtifact(bodyText, 'markdown', title);
    docCount++;
  }

  if (docCount > 0) {
    const indicator = document.getElementById('msg-code-indicator');
    if (indicator) {
      indicator.textContent = `📄 ${docCount} documento${docCount > 1 ? 's' : ''} creado${docCount > 1 ? 's' : ''}`;
      indicator.style.display = 'inline';
      setTimeout(() => { indicator.style.display = 'none'; }, 4000);
    }
  }

  store.set('_currentTurnTextBuffer', '');
  store.set('_turnState', 'thinking');
  updateThinkingPanel('');
}

export function hideChatStatus() {}
export function showChatStatus(phase, detail) {
  showProgressStep('info', `Ejecutando: ${phase}`, detail || '');
}
export function showDoneStatus(count) {
  if (count > 0) showProgressStep('success', 'Completado', `${count} herramienta(s) ejecutada(s)`);
}
export function appendCommandResult(title, output) {
  if (!output) return;
  _hideProgress();
  _stopTypewriter();
  _typewriterTarget = '';
  _typewriterIndex = 0;
  const text = `[${title}]\n${output.substring(0, 1000)}`;
  _fadeOutMsg(() => {
    _setMsg('⚙ SISTEMA', text, 'system');
  });
  _convLog('conv_separator', '');
  _convLog('conv_response', '⚙ ' + title + ': ' + output.substring(0, 200));
}
export function appendVoiceNote() {}

export function sendTextMessage() {
  const textInput = document.getElementById('text-input');
  const text = textInput?.value?.trim();
  if (!text) return;

  const correctedText = autoCorrectSpanish(text);
  const displayText = correctedText || text;

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
      if (!ws || ws.readyState !== 1) {
        showSystemErrorMessage('No se pudo reconectar.');
        return;
      }
    }

    ws.send(JSON.stringify({
      clientContent: { turns: [{ role: 'user', parts: [{ text: '[Texto] ' + displayText }] }], turnComplete: true }
    }));
    _log('info', 'Mensaje de texto enviado');
  });
}