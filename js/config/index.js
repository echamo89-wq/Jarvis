import { store } from '../state/store.js';
import { showSystemErrorMessage } from '../chat/messages.js';

// Configure your support email here, or leave empty to disable the mailto fallback
const FEEDBACK_EMAIL = 'feedback@jarvis.local';

export function closeModal(modalEl, duration = 150) {
  if (!modalEl) return;
  if (modalEl.classList.contains('closing')) return;
  modalEl.classList.add('closing');
  setTimeout(() => {
    modalEl.classList.remove('active', 'closing');
  }, duration);
}

let _memoryWriteTimer = null;
let _pendingMemory = null;

async function _debouncedMemoryWrite(memory, immediate) {
  _pendingMemory = memory;
  if (_memoryWriteTimer) clearTimeout(_memoryWriteTimer);
  if (immediate) {
    _memoryWriteTimer = null;
    await window.electronAPI.memoryWrite(_pendingMemory);
    _pendingMemory = null;
  } else {
    _memoryWriteTimer = setTimeout(async () => {
      _memoryWriteTimer = null;
      if (_pendingMemory) {
        await window.electronAPI.memoryWrite(_pendingMemory);
        _pendingMemory = null;
      }
    }, 5000);
  }
}

const _DEFAULTS = {
  jarvis_username: '',
  jarvis_title: '',
  jarvis_context: '',
  jarvis_rules: '',
  jarvis_city: '',
  jarvis_lang: 'es',
  jarvis_personality: 'companion',
  jarvis_voice: 'Fenrir',
  jarvis_length: 'normal',
  jarvis_fontsize: '2',
  jarvis_sfx: 'true',
  jarvis_show_diag: 'true',
  jarvis_anims: 'true',
  jarvis_vad_threshold: '100',
  jarvis_theme: 'dark',
  jarvis_always_on: 'false'
};

export async function loadConfig() {
  let memory = null;
  try {
    memory = await window.electronAPI.memoryRead();
    if (memory) {
      memory.sessionCount = (memory.sessionCount || 0) + 1;
      memory.lastSeen = new Date().toISOString();
      if (!memory.firstSeen) memory.firstSeen = new Date().toISOString();
      store.set('userMemory', memory);
      syncMemoryToLocal(memory);
      await _debouncedMemoryWrite(memory, true);
    }
  } catch (e) {
    logConfig('error', `Error al cargar memoria: ${e.message}`);
  }

  Object.keys(_DEFAULTS).forEach(k => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, _DEFAULTS[k]);
  });

  const vad = parseInt(localStorage.getItem('jarvis_vad_threshold') || '300');
  store.set('speechEnergyThreshold', vad);
  const voice = localStorage.getItem('jarvis_voice') || 'Fenrir';
  store.set('userVoice', voice);
  const theme = localStorage.getItem('jarvis_theme') || 'dark';
  applyTheme(theme);
  applyFontSize(parseInt(localStorage.getItem('jarvis_fontsize') || '2'));
  applyAnimations(localStorage.getItem('jarvis_anims') !== 'false');
  store.set('speechEnergyThreshold', parseInt(localStorage.getItem('jarvis_vad_threshold') || '300'));
  const alwaysOn = localStorage.getItem('jarvis_always_on') === 'true';
  document.getElementById('always-on-toggle').checked = alwaysOn;
  store.set('alwaysOn', alwaysOn);

  updateUserBadge();
}

function syncMemoryToLocal(memory) {
  const map = {
    userName: 'jarvis_username',
    userTitle: 'jarvis_title',
    userContext: 'jarvis_context',
    userRules: 'jarvis_rules',
    city: 'jarvis_city',
    language: 'jarvis_lang',
    personality: 'jarvis_personality',
    voice: 'jarvis_voice'
  };
  Object.entries(map).forEach(([memKey, lsKey]) => {
    if (memory[memKey]) localStorage.setItem(lsKey, memory[memKey]);
  });
}

export async function saveConfig() {
  const fields = {
    lang: document.getElementById('lang-select')?.value || 'es',
    username: document.getElementById('username-input')?.value.trim() || '',
    title: document.getElementById('title-input')?.value.trim() || '',
    personality: document.getElementById('personality-select')?.value || 'professional',
    voice: document.getElementById('voice-select')?.value || 'Fenrir',
    length: document.getElementById('length-select')?.value || 'normal',
    fontSize: document.getElementById('font-size-slider')?.value || '2',
    sfx: document.getElementById('sfx-toggle')?.checked ?? true,
    anims: document.getElementById('anim-toggle')?.checked ?? true,
    city: document.getElementById('city-input')?.value.trim() || '',
    rules: document.getElementById('rules-textarea')?.value.trim() || '',
    context: document.getElementById('context-textarea')?.value.trim() || '',
    vadThreshold: document.getElementById('vad-slider')?.value || '300',
    alwaysOn: document.getElementById('always-on-toggle')?.checked ?? false
  };

  const old = {
    voice: localStorage.getItem('jarvis_voice') || 'Fenrir',
    personality: localStorage.getItem('jarvis_personality') || 'companion',
    length: localStorage.getItem('jarvis_length') || 'normal',
    username: localStorage.getItem('jarvis_username') || '',
    title: localStorage.getItem('jarvis_title') || '',
    lang: localStorage.getItem('jarvis_lang') || 'es',
    city: localStorage.getItem('jarvis_city') || '',
    rules: localStorage.getItem('jarvis_rules') || '',
    context: localStorage.getItem('jarvis_context') || ''
  };

  const needsReconnect = (fields.voice !== old.voice) || (fields.personality !== old.personality) ||
    (fields.length !== old.length) || (fields.username !== old.username) ||
    (fields.title !== old.title) || (fields.lang !== old.lang) || (fields.city !== old.city) ||
    (fields.rules !== old.rules) || (fields.context !== old.context);

  localStorage.setItem('jarvis_lang', fields.lang);
  localStorage.setItem('jarvis_username', fields.username);
  localStorage.setItem('jarvis_title', fields.title);
  localStorage.setItem('jarvis_personality', fields.personality);
  localStorage.setItem('jarvis_voice', fields.voice);
  localStorage.setItem('jarvis_length', fields.length);
  localStorage.setItem('jarvis_fontsize', fields.fontSize);
  localStorage.setItem('jarvis_sfx', fields.sfx);
  localStorage.setItem('jarvis_anims', fields.anims);
  localStorage.setItem('jarvis_city', fields.city);
  localStorage.setItem('jarvis_rules', fields.rules);
  localStorage.setItem('jarvis_context', fields.context);
  localStorage.setItem('jarvis_vad_threshold', fields.vadThreshold);
  localStorage.setItem('jarvis_always_on', fields.alwaysOn);

  updateUserBadge();

  store.set('userVoice', fields.voice);
  store.set('speechEnergyThreshold', parseInt(fields.vadThreshold));
  store.set('alwaysOn', fields.alwaysOn);

  const memory = store.get('userMemory');
  if (memory) {
    Object.assign(memory, {
      userName: fields.username,
      userTitle: fields.title,
      userContext: fields.context,
      userRules: fields.rules,
      city: fields.city,
      language: fields.lang,
      personality: fields.personality,
      voice: fields.voice
    });
    await _debouncedMemoryWrite(memory, true);
  }

  applyFontSize(parseInt(fields.fontSize));
  applyAnimations(fields.anims);

  closeModal(document.getElementById('config-modal'));
  return needsReconnect;
}

export function applyTheme(theme) {
  const body = document.body;
  body.classList.remove('light-theme', 'dark-theme');
  body.classList.add(theme === 'light' ? 'light-theme' : 'dark-theme');
}

export function toggleTheme() {
  const current = localStorage.getItem('jarvis_theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('jarvis_theme', next);
  applyTheme(next);
  return next;
}

export function applyFontSize(val) {
  const el = document.getElementById('msg-text');
  if (el) {
    if (val === 1) el.style.fontSize = '0.72rem';
    else if (val === 3) el.style.fontSize = '0.95rem';
    else el.style.fontSize = '0.9rem';
  }
}


export function applyAnimations(enabled) {
  document.body.classList.toggle('disable-animations', !enabled);
}

export { buildSystemInstruction } from './system-instruction.js';

export function updateUserBadge() {
  const badge = document.getElementById('user-badge');
  if (!badge) return;
  const title = localStorage.getItem('jarvis_title') || '';
  const name = localStorage.getItem('jarvis_username') || '';
  const sep = document.getElementById('badge-separator');
  if (name || title) {
    badge.textContent = [title, name].filter(Boolean).join(' ');
    badge.style.display = 'inline';
    if (sep) sep.style.display = 'inline';
  } else {
    badge.style.display = 'none';
    if (sep) sep.style.display = 'none';
  }
}

export function updateThemeUI(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const text = document.getElementById('theme-toggle-text');
  const icon = document.getElementById('theme-toggle-icon');
  const configCheckbox = document.getElementById('theme-toggle-config');
  if (theme === 'light') {
    if (text) text.innerText = 'Modo Oscuro';
    if (icon) icon.innerHTML = '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
    if (configCheckbox) configCheckbox.checked = true;
  } else {
    if (text) text.innerText = 'Modo Claro';
    if (icon) icon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>';
    if (configCheckbox) configCheckbox.checked = false;
  }
}

export function exportConversation() {
  const history = store.get('conversationHistory') || [];
  if (history.length === 0) {
    showSystemErrorMessage('El historial de conversaci\u00f3n est\u00e1 vac\u00edo.');
    return;
  }
  let logText = '=========================================\n';
  logText += '        JARVIS CENTRAL SYSTEM CHAT LOG    \n';
  logText += ` Generado: ${new Date().toLocaleString()}\n`;
  logText += '=========================================\n\n';
  history.forEach(msg => {
    const speaker = msg.role === 'user' ? 'USUARIO' : msg.role === 'model' ? 'JARVIS' : 'SISTEMA';
    logText += `[${speaker}]\n${msg.content}\n\n`;
  });
  const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  link.download = `JARVIS_chat_${stamp}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function logConfig(type, message) {
  if (window.electronAPI?.logToTerminal) window.electronAPI.logToTerminal(type, message);
  if (type === 'error') console.error(`[CONFIG] ${message}`);
  else if (type === 'warn') console.warn(`[CONFIG] ${message}`);
  else console.log(`[CONFIG] ${message}`);
}

document.addEventListener('DOMContentLoaded', () => {
  // ── Gemini API Key — show/hide password & live test ──
  const geminiKeyInput = document.getElementById('config-gemini-key');
  const geminiToggle   = document.getElementById('config-gemini-toggle');
  const geminiTestBtn  = document.getElementById('config-test-gemini-btn');
  const geminiStatus   = document.getElementById('config-gemini-status');

  if (geminiToggle && geminiKeyInput) {
    geminiToggle.addEventListener('click', () => {
      const isPass = geminiKeyInput.type === 'password';
      geminiKeyInput.type = isPass ? 'text' : 'password';
      geminiToggle.textContent = isPass ? '🙈' : '👁';
    });
  }

  // Pre-fill saved key (masked)
  const savedKey = localStorage.getItem('jarvis_gemini_api_key') || '';
  if (geminiKeyInput && savedKey) geminiKeyInput.value = savedKey;

  if (geminiTestBtn && geminiKeyInput && geminiStatus) {
    geminiTestBtn.addEventListener('click', async () => {
      const key = geminiKeyInput.value.trim();
      if (!key) {
        geminiStatus.textContent = '⚠ Introduce una API key primero.';
        geminiStatus.style.color = 'var(--warning)';
        geminiStatus.style.display = 'block';
        return;
      }
      geminiTestBtn.disabled = true;
      geminiTestBtn.textContent = 'Probando…';
      geminiStatus.style.display = 'none';

      try {
        // Lightweight REST ping — list models endpoint
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const data = await resp.json();
        if (resp.ok && data.models) {
          geminiStatus.textContent = '✅ Clave válida. Conexión con Gemini establecida.';
          geminiStatus.style.color = 'var(--success)';
          geminiStatus.style.background = 'rgba(46,213,115,0.08)';
          // Persist the validated key
          localStorage.setItem('jarvis_gemini_api_key', key);
          try {
            await window.electronAPI?.setupGeminiKey(key);
            geminiStatus.textContent = '✅ Clave válida. Guardada para esta sesión y futuras ejecuciones.';
          } catch (err) {
            geminiStatus.textContent = '✅ Clave válida, pero no se pudo sincronizar con el proceso principal.';
            console.warn('[CONFIG] No se pudo guardar la clave en el proceso principal:', err.message);
          }
          window.electronAPI?.logToTerminal?.('info', '[CONFIG] API Key de Gemini validada y guardada.');
        } else {
          const msg = data?.error?.message || 'Clave inválida o sin permisos.';
          geminiStatus.textContent = `❌ Error: ${msg}`;
          geminiStatus.style.color = 'var(--danger)';
          geminiStatus.style.background = 'rgba(255,59,48,0.08)';
        }
      } catch (err) {
        geminiStatus.textContent = `❌ Sin conexión o timeout: ${err.message}`;
        geminiStatus.style.color = 'var(--danger)';
        geminiStatus.style.background = 'rgba(255,59,48,0.08)';
      } finally {
        geminiStatus.style.display = 'block';
        geminiTestBtn.disabled = false;
        geminiTestBtn.textContent = 'Probar Clave';
      }
    });
  }

  // ── Feedback / Soporte ────────────────────────────────
  const feedbackBtn    = document.getElementById('config-send-feedback-btn');
  const feedbackMsg    = document.getElementById('feedback-message');
  const feedbackFile   = document.getElementById('feedback-file');
  const feedbackStatus = document.getElementById('config-feedback-status');

  if (feedbackBtn && feedbackMsg) {
    feedbackBtn.addEventListener('click', async () => {
      const message = feedbackMsg.value.trim();
      if (!message) {
        if (feedbackStatus) {
          feedbackStatus.textContent = '⚠ Escribe un mensaje antes de enviar.';
          feedbackStatus.style.color = 'var(--warning)';
          feedbackStatus.style.display = 'block';
        }
        return;
      }
      feedbackBtn.disabled = true;
      feedbackBtn.textContent = 'Enviando…';
      if (feedbackStatus) feedbackStatus.style.display = 'none';

      try {
        const user = localStorage.getItem('jarvis_username') || 'anon';
        const version = '1.0.0';
        const timestamp = new Date().toISOString();
        let sent = false;

        // 1) Intentar Formspree vía IPC (automático)
        if (window.electronAPI?.sendFeedbackEmail) {
          const file = feedbackFile?.files?.[0];
          const result = await window.electronAPI.sendFeedbackEmail({
            message, user, version,
            filepath: file?.path || ''
          });
          sent = result.success;
        }

        // 2) Guardar copia local en servidor
        try {
          const formData = new FormData();
          formData.append('message', message);
          formData.append('version', version);
          formData.append('timestamp', timestamp);
          formData.append('user', user);
          if (feedbackFile?.files[0]) {
            const file = feedbackFile.files[0];
            if (file.size > 25 * 1024 * 1024) throw new Error('El archivo supera el límite de 25 MB.');
            formData.append('attachment', file, file.name);
          }
          const resp = await fetch('http://localhost:3001/api/feedback', {
            method: 'POST', body: formData, signal: AbortSignal.timeout(15000)
          });
          if (resp.ok) sent = true;
        } catch (e) {}

        if (sent) {
          if (feedbackStatus) {
            feedbackStatus.textContent = '✅ Reporte enviado. Gracias.';
            feedbackStatus.style.color = 'var(--success)'; feedbackStatus.style.display = 'block';
          }
        } else {
          window.open(`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('JARVIS Feedback - ' + user)}&body=${encodeURIComponent('Mensaje: ' + message + '\n\nUsuario: ' + user + '\nVersión: ' + version + '\nTimestamp: ' + timestamp)}`, '_blank');
          if (feedbackStatus) {
            feedbackStatus.textContent = '✅ Abierto tu cliente de correo. Presiona "Enviar".';
            feedbackStatus.style.color = 'var(--success)'; feedbackStatus.style.display = 'block';
          }
        }
        feedbackMsg.value = '';
        if (feedbackFile) feedbackFile.value = '';
      } catch (err) {
        window.open(`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('JARVIS Feedback')}&body=${encodeURIComponent('Mensaje: ' + message + '\n\nError: ' + err.message)}`, '_blank');
        if (feedbackStatus) {
          feedbackStatus.textContent = '✅ Abierto tu cliente de correo.';
          feedbackStatus.style.color = 'var(--success)'; feedbackStatus.style.display = 'block';
        }
        logConfig('error', `Feedback error: ${err.message}`);
      } finally {
        feedbackBtn.disabled = false;
        feedbackBtn.textContent = 'Enviar Reporte';
      }
    });
  }

  // ── State sync: bubble + reactor
  const _statusBubble = document.getElementById('message-area');
  const _reactorEl = document.getElementById('focus-reactor-el');
  const _stateEls = [_statusBubble, _reactorEl].filter(Boolean);
  if (_stateEls.length) {
    const _bubbleStates = ['idle', 'connecting', 'listening', 'speaking', 'working', 'error'];
    store.on('state:changed', (state) => {
      _stateEls.forEach(el => _bubbleStates.forEach(s => el.classList.remove(s)));
      const normalized = (state || 'idle').toLowerCase();
      if (_bubbleStates.includes(normalized)) _stateEls.forEach(el => el.classList.add(normalized));
    });
    const current = (store.getState() || 'idle').toLowerCase();
    if (_bubbleStates.includes(current)) _stateEls.forEach(el => el.classList.add(current));
  }
});
