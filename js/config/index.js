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
  jarvis_show_diag: 'true',
  jarvis_anims: 'true',
  jarvis_vad_threshold: '100',
  jarvis_interrupt_mode: 'true',
  jarvis_theme: 'dark',
  jarvis_graphics: 'high'
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

  const voice = localStorage.getItem('jarvis_voice') || 'Fenrir';
  store.set('userVoice', voice);
  const provider = localStorage.getItem('jarvis_active_provider') || 'gemini';
  store.set('_activeProvider', provider);
  const theme = localStorage.getItem('jarvis_theme') || 'dark';
  applyTheme(theme);
  applyFontSize(parseInt(localStorage.getItem('jarvis_fontsize') || '2'));
  const isAnimsEnabled = localStorage.getItem('jarvis_anims') !== 'false';
  applyAnimations(isAnimsEnabled);
  const animCheckbox = document.getElementById('anim-toggle');
  if (animCheckbox) animCheckbox.checked = isAnimsEnabled;
  applyGraphicsQuality(localStorage.getItem('jarvis_graphics') || 'high');

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
    personality: document.getElementById('personality-select')?.value || 'companion',
    voice: document.getElementById('voice-select')?.value || 'Fenrir',
    voiceGender: document.getElementById('voice-gender-select')?.value || 'male',
    length: document.getElementById('length-select')?.value || 'normal',
    fontSize: document.getElementById('font-size-slider')?.value || '2',
    anims: document.getElementById('anim-toggle')?.checked ?? true,
    city: document.getElementById('city-input')?.value.trim() || '',
    rules: document.getElementById('rules-textarea')?.value.trim() || '',
    context: document.getElementById('context-textarea')?.value.trim() || '',
    graphics: document.getElementById('graphics-select')?.value || 'high',
    interruptMode: document.getElementById('interrupt-toggle')?.checked ?? true,
    vadThreshold: document.getElementById('vad-slider')?.value || '300',
    // Permisos
    permOpenBrowser: document.getElementById('perm-open-browser')?.checked ?? true,
    permLaunchApp: document.getElementById('perm-launch-app')?.checked ?? true,
    permSetVolume: document.getElementById('perm-set-volume')?.checked ?? true,
    permFileOps: document.getElementById('perm-file-operations')?.checked ?? true,
    permExecutePS: document.getElementById('perm-execute-ps')?.checked ?? true,
    permDownloadYT: document.getElementById('perm-download-youtube')?.checked ?? true,
    permEditVideo: document.getElementById('perm-edit-video')?.checked ?? true,
    permScreenshot: document.getElementById('perm-screenshot')?.checked ?? true,
    permKeyboard: document.getElementById('perm-keyboard')?.checked ?? true,
    permClipboard: document.getElementById('perm-clipboard')?.checked ?? true,
    permFindFiles: document.getElementById('perm-find-files')?.checked ?? true,
    permSystemStats: document.getElementById('perm-system-stats')?.checked ?? true,
    permReminder: document.getElementById('perm-set-reminder')?.checked ?? true,
    permNotifications: document.getElementById('perm-notifications')?.checked ?? true,
    permExecuteArbitrary: document.getElementById('perm-execute-arbitrary')?.checked ?? true,
    permKillProcess: document.getElementById('perm-kill-process')?.checked ?? true,
    permSensitivePaths: document.getElementById('perm-sensitive-paths')?.checked ?? false,
    // Búsqueda Web
    googleApiKey: document.getElementById('config-google-api-key')?.value.trim() || '',
    googleCx: document.getElementById('config-google-cx')?.value.trim() || '',
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
    context: localStorage.getItem('jarvis_context') || '',
    voiceGender: localStorage.getItem('jarvis_voice_gender') || 'male',
  };

  const needsReconnect = (fields.voice !== old.voice) || (fields.personality !== old.personality) ||
    (fields.length !== old.length) || (fields.username !== old.username) ||
    (fields.title !== old.title) || (fields.lang !== old.lang) || (fields.city !== old.city) ||
    (fields.rules !== old.rules) || (fields.context !== old.context) ||
    (fields.voiceGender !== old.voiceGender);

  localStorage.setItem('jarvis_lang', fields.lang);
  localStorage.setItem('jarvis_username', fields.username);
  localStorage.setItem('jarvis_title', fields.title);
  localStorage.setItem('jarvis_personality', fields.personality);
  localStorage.setItem('jarvis_voice', fields.voice);
  localStorage.setItem('jarvis_length', fields.length);
  localStorage.setItem('jarvis_fontsize', fields.fontSize);
  localStorage.setItem('jarvis_anims', fields.anims);
  localStorage.setItem('jarvis_city', fields.city);
  localStorage.setItem('jarvis_rules', fields.rules);
  localStorage.setItem('jarvis_context', fields.context);
  localStorage.setItem('jarvis_graphics', fields.graphics);
  localStorage.setItem('jarvis_voice_gender', fields.voiceGender);
  localStorage.setItem('jarvis_interrupt_mode', fields.interruptMode ? 'true' : 'false');
  localStorage.setItem('jarvis_vad_threshold', fields.vadThreshold);
  localStorage.setItem('jarvis_google_api_key', fields.googleApiKey);
  localStorage.setItem('jarvis_google_cx', fields.googleCx);
  store.set('_activeProvider', 'gemini');

  // Guardar permisos
  const permKeys = ['permOpenBrowser','permLaunchApp','permSetVolume','permFileOps','permExecutePS','permDownloadYT','permEditVideo','permScreenshot','permKeyboard','permClipboard','permFindFiles','permSystemStats','permReminder','permNotifications','permExecuteArbitrary','permKillProcess','permSensitivePaths'];
  permKeys.forEach(k => localStorage.setItem(`jarvis_${k}`, fields[k] ? '1' : '0'));

  // Guardar whitelist de alto riesgo
  const whitelistEl = document.getElementById('risk-whitelist');
  if (whitelistEl) {
    localStorage.setItem('jarvis_risk_whitelist', whitelistEl.value);
    import('../tools/executor.js').then(m => m.clearApprovedCache());
  }

  updateUserBadge();

  store.set('userVoice', fields.voice);

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
  applyGraphicsQuality(fields.graphics);

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

const GRAPHICS_PARTICLES = { low: 0, medium: 12, high: 35, ultra: 70 };
const GRAPHICS_CLASSES = { low: 'gfx-low', medium: 'gfx-medium', high: 'gfx-high', ultra: 'gfx-ultra' };

export function applyGraphicsQuality(level) {
  const valid = GRAPHICS_PARTICLES[level] !== undefined ? level : 'high';
  localStorage.setItem('jarvis_graphics', valid);
  Object.values(GRAPHICS_CLASSES).forEach(c => document.body.classList.remove(c));
  document.body.classList.add(GRAPHICS_CLASSES[valid]);
  store.set('graphicsQuality', valid);
  const particleCount = GRAPHICS_PARTICLES[valid];
  const container = document.getElementById('main-bg-particles');
  if (container) {
    container.innerHTML = '';
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${10 + Math.random() * 15}s`;
      p.style.animationDelay = `${Math.random() * 10}s`;
      p.style.width = p.style.height = `${1 + Math.random() * (valid === 'ultra' ? 3 : 2)}px`;
      container.appendChild(p);
    }
  }
  if (valid === 'low') {
    document.body.classList.add('disable-animations');
  } else if (localStorage.getItem('jarvis_anims') !== 'false') {
    document.body.classList.remove('disable-animations');
  }
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
  // ── Universal API Key — Auto-detection & Testing ──
  const uniKeyInput   = document.getElementById('config-universal-key');
  const uniToggle     = document.getElementById('config-universal-toggle');
  const uniTestBtn    = document.getElementById('config-test-universal-btn');
  const uniStatus     = document.getElementById('config-universal-status');
  const uniTypeTag    = document.getElementById('universal-key-type');

  if (uniToggle && uniKeyInput) {
    uniToggle.addEventListener('click', () => {
      const isPass = uniKeyInput.type === 'password';
      uniKeyInput.type = isPass ? 'text' : 'password';
      uniToggle.textContent = isPass ? '🙈' : '👁';
    });
  }

  const googleKeyInput = document.getElementById('config-google-api-key');
  const googleToggle = document.getElementById('config-google-api-toggle');
  if (googleToggle && googleKeyInput) {
    googleToggle.addEventListener('click', () => {
      const isPass = googleKeyInput.type === 'password';
      googleKeyInput.type = isPass ? 'text' : 'password';
      googleToggle.textContent = isPass ? '🙈' : '👁';
    });
  }

  // Pre-fill saved key (masked)
  const savedKey = localStorage.getItem('jarvis_gemini_api_key') || localStorage.getItem('jarvis_openai_api_key') || '';
  if (uniKeyInput && savedKey) {
    uniKeyInput.value = savedKey;
    _detectKeyProvider(savedKey);
  }

  function _detectKeyProvider(key) {
    if (!uniTypeTag) return;
    const k = key.trim();
    if (!k) {
      uniTypeTag.textContent = '✨ Ingresá cualquier clave API para auto-detectar el proveedor.';
      uniTypeTag.style.color = 'var(--primary)';
      return;
    }
    if (k.startsWith('AIzaSy')) {
      uniTypeTag.textContent = '⭐ Detectado: Google Gemini (Recomendado — Oficial)';
      uniTypeTag.style.color = '#34c759';
    } else if (k.startsWith('sk-proj-') || (k.startsWith('sk-') && !k.startsWith('sk-ant-'))) {
      uniTypeTag.textContent = '🤖 Detectado: OpenAI (ChatGPT / GPT-4o)';
      uniTypeTag.style.color = '#70d6ff';
    } else if (k.startsWith('sk-ant-')) {
      uniTypeTag.textContent = '🧠 Detectado: Anthropic (Claude Sonnet)';
      uniTypeTag.style.color = '#a78bfa';
    } else if (k.startsWith('gsk_')) {
      uniTypeTag.textContent = '⚡ Detectado: Groq Cloud (Ultra Llama/Mixtral)';
      uniTypeTag.style.color = '#ff9f0a';
    } else {
      uniTypeTag.textContent = '🔍 Detectado: Formato Estándar API Key';
      uniTypeTag.style.color = 'var(--primary)';
    }
  }

  if (uniKeyInput) {
    uniKeyInput.addEventListener('input', (e) => {
      _detectKeyProvider(e.target.value);
    });
  }

  if (uniTestBtn && uniKeyInput && uniStatus) {
    uniTestBtn.addEventListener('click', async () => {
      const key = uniKeyInput.value.trim();
      if (!key) {
        uniStatus.textContent = '⚠ Introduce una clave API primero.';
        uniStatus.style.color = 'var(--warning)';
        uniStatus.style.display = 'block';
        return;
      }
      uniTestBtn.disabled = true;
      uniTestBtn.textContent = 'Probando Clave…';
      uniStatus.style.display = 'none';

      try {
        if (key.startsWith('AIzaSy')) {
          // REST ping Gemini
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const data = await resp.json();
          if (resp.ok && data.models) {
            uniStatus.textContent = '✅ Clave Gemini válida. Conexión establecida con éxito.';
            uniStatus.style.color = 'var(--success)';
            uniStatus.style.background = 'rgba(46,213,115,0.08)';
            localStorage.setItem('jarvis_gemini_api_key', key);
            await window.electronAPI?.setupGeminiKey(key);
          } else {
            uniStatus.textContent = `❌ Error Gemini: ${data?.error?.message || 'Clave no válida.'}`;
            uniStatus.style.color = 'var(--danger)';
            uniStatus.style.background = 'rgba(255,59,48,0.08)';
          }
        } else {
          // General validation
          uniStatus.textContent = '✅ Clave guardada y lista para peticiones de IA.';
          uniStatus.style.color = 'var(--success)';
          uniStatus.style.background = 'rgba(46,213,115,0.08)';
          localStorage.setItem('jarvis_gemini_api_key', key);
          await window.electronAPI?.setupGeminiKey(key);
        }
      } catch (err) {
        uniStatus.textContent = `❌ Sin conexión o timeout: ${err.message}`;
        uniStatus.style.color = 'var(--danger)';
        uniStatus.style.background = 'rgba(255,59,48,0.08)';
      } finally {
        uniStatus.style.display = 'block';
        uniTestBtn.disabled = false;
        uniTestBtn.textContent = 'Probar Clave API';
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

  // ── Graphics quality init ──────────────────────────────
  const graphicsSelect = document.getElementById('graphics-select');
  if (graphicsSelect) {
    graphicsSelect.value = localStorage.getItem('jarvis_graphics') || 'high';
    graphicsSelect.addEventListener('change', () => {
      applyGraphicsQuality(graphicsSelect.value);
      _syncGfxCards(graphicsSelect.value);
    });
  }

  function _syncGfxCards(level) {
    document.querySelectorAll('.gfx-card').forEach(card => {
      card.classList.toggle('selected', card.getAttribute('data-gfx') === level);
    });
  }
  document.querySelectorAll('.gfx-card').forEach(card => {
    card.addEventListener('click', () => {
      const level = card.getAttribute('data-gfx');
      if (!level) return;
      if (graphicsSelect) graphicsSelect.value = level;
      applyGraphicsQuality(level);
      _syncGfxCards(level);
    });
  });
  _syncGfxCards(localStorage.getItem('jarvis_graphics') || 'high');

  // ── Voice preview ──────────────────────────────────────
  const voicePreviewBtn = document.getElementById('voice-preview-btn');
  const voicePreviewStatus = document.getElementById('voice-preview-status');
  if (voicePreviewBtn) {
    voicePreviewBtn.addEventListener('click', () => {
      const voiceName = document.getElementById('voice-select')?.value || 'Fenrir';
      if (typeof window.speechSynthesis === 'undefined') {
        if (voicePreviewStatus) {
          voicePreviewStatus.textContent = '❌ Voz local no disponible.';
          voicePreviewStatus.style.color = 'var(--danger)';
        }
        return;
      }
      const utterance = new SpeechSynthesisUtterance('Hola, soy Jarvis. Tu asistente personal.');
      utterance.lang = 'es-ES';
      utterance.rate = 1;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === voiceName);
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (voicePreviewStatus) {
          voicePreviewStatus.textContent = `🔊 Reproduciendo "${voiceName}"…`;
          voicePreviewStatus.style.color = 'var(--primary)';
        }
      };
      utterance.onend = () => {
        if (voicePreviewStatus) voicePreviewStatus.textContent = '';
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  // ── Voice gender init ─────────────────────────────────
  const voiceGenderSelect = document.getElementById('voice-gender-select');
  if (voiceGenderSelect) {
    voiceGenderSelect.value = localStorage.getItem('jarvis_voice_gender') || 'male';
  }

  // ── Permissions init: Category toggles ────────────────
  const CATEGORIES = {
    system: {
      key: 'jarvis_cat_system',
      perms: [
        'jarvis_permOpenBrowser', 'jarvis_permLaunchApp', 'jarvis_permSetVolume',
        'jarvis_permExecutePS', 'jarvis_permNotifications', 'jarvis_permSystemStats',
        'jarvis_permExecuteArbitrary', 'jarvis_permKillProcess', 'jarvis_permSensitivePaths'
      ]
    },
    files: {
      key: 'jarvis_cat_files',
      perms: [
        'jarvis_permFileOps', 'jarvis_permFindFiles', 'jarvis_permDownloadYT', 'jarvis_permEditVideo'
      ]
    },
    screen: {
      key: 'jarvis_cat_screen',
      perms: [
        'jarvis_permScreenshot', 'jarvis_permKeyboard', 'jarvis_permClipboard', 'jarvis_permReminder'
      ]
    },
    integrations: {
      key: 'jarvis_cat_integrations',
      perms: []
    }
  };

  function _applyCategory(catId, enabled) {
    const cat = CATEGORIES[catId];
    if (!cat) return;
    localStorage.setItem(cat.key, enabled ? '1' : '0');
    cat.perms.forEach(key => localStorage.setItem(key, enabled ? '1' : '0'));
    // Sync kernel permissions
    try {
      const kp = JSON.parse(localStorage.getItem('jarvis_kernel_permissions') || '{}');
      if (catId === 'system') kp.shell = enabled ? 'granted' : 'denied';
      if (catId === 'screen') kp.screen = enabled ? 'granted' : 'denied';
      localStorage.setItem('jarvis_kernel_permissions', JSON.stringify(kp));
    } catch (e) {}
    // Sync ps-executor system_execution_allowed (encrypted credentials)
    if (catId === 'system' && window.electronAPI?.secureCredentialSet) {
      window.electronAPI.secureCredentialSet('system_execution_allowed', enabled ? 'all' : '').catch(() => {});
    }
  }

  // Load saved state per category
  Object.keys(CATEGORIES).forEach(catId => {
    const saved = localStorage.getItem(CATEGORIES[catId].key);
    const el = document.getElementById('cat-' + catId);
    if (el) {
      const enabled = saved === null || saved !== '0';
      el.checked = enabled;
      el.addEventListener('change', () => _applyCategory(catId, el.checked));
      // Sync all individual perms to match the category state
      _applyCategory(catId, enabled);
    }
  });

  // ── VAD preset buttons ────────────────────────────────
  document.querySelectorAll('[data-vad]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-vad');
      const slider = document.getElementById('vad-slider');
      if (slider) {
        slider.value = val;
        localStorage.setItem('jarvis_vad_threshold', val);
        slider.dispatchEvent(new Event('input'));
      }
    });
  });

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

export async function initOllamaConfigUI() {
  const genderSelect = document.getElementById('voice-gender-select');
  const voiceSelect = document.getElementById('voice-select');
  if (genderSelect && voiceSelect) {
    const filterVoices = () => {
      const gender = genderSelect.value;
      const allVoices = [
        { value: 'Fenrir', label: 'Fenrir (Masculino)', gender: 'male' },
        { value: 'Puck', label: 'Puck (Neutro)', gender: 'male' },
        { value: 'Charon', label: 'Charon (Grave)', gender: 'male' },
        { value: 'Aoede', label: 'Aoede (Femenino)', gender: 'female' },
        { value: 'Athena', label: 'Athena (Femenino)', gender: 'female' },
      ];
      const filtered = allVoices.filter(v => v.gender === gender);
      const currentValue = voiceSelect.value;
      voiceSelect.innerHTML = '';
      filtered.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.value;
        opt.textContent = v.label;
        voiceSelect.appendChild(opt);
      });
      if (filtered.some(v => v.value === currentValue)) {
        voiceSelect.value = currentValue;
      }
    };
    genderSelect.addEventListener('change', filterVoices);
    genderSelect.value = localStorage.getItem('jarvis_voice_gender') || 'male';
    filterVoices();
  }
}
