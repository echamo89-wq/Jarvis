import { store } from './state/store.js';
import { STATE, EVENTS } from './state/constants.js';
import { bus } from './utils/event-bus.js';
import { loadConfig, saveConfig, toggleTheme, applyTheme, updateThemeUI, exportConversation as exportChat, applyAnimations, closeModal, initOllamaConfigUI } from './config/index.js';
import { initAudio } from './audio/playback.js';
import { sendTextMessage, showSystemErrorMessage, appendSystemMessage, appendCommandResult, _resetTurnState, showInstantGreeting } from './chat/messages.js';
import { updateDiagnostics, updateUiState } from './chat/diagnostics.js';
import { connectWebSocket, cleanup as cleanupWs } from './Core/Connection/manager.js';
import { resetGreetingFlag } from './Core/Connection/handler.js';
import { initConnectionGuardian, stopConnectionGuardian } from './system/connection-guardian.js';
import { loadAppPathCache, rebuildCatalog as rebuildAppsCatalog } from './system/apps.js';
import { checkAuth, onAuth } from './auth/index.js';
import { initArtifactsPanel } from './documents/artifacts.js';
import { initWeatherPanel } from './weather/forecast-panel.js';
import { initInfoPanel, showInfoPanel } from './ui/info-panel.js';
import { initPlanPanel } from './ui/plan-panel.js';
import { JOS } from './engines/index.js';
import './system/supervisor.js';
import { initErrorReporter } from './system/error-reporter.js';
import { initNetworkMonitor } from './engines/ai/network-monitor.js';
import { kernel } from './kernel/index.js';
import { toggleDevConsole } from './ui/dev-console.js'; // Dev console — Ctrl+1 para abrir/cerrar
import { initReminderEngine, _updateRemindersUI } from './system/reminders.js';

try {
  localStorage.removeItem('jarvis_research_projects');
  localStorage.removeItem('jarvis_research_unseen');
  document.getElementById('research-modal')?.remove();
  document.getElementById('research-overlay')?.remove();
} catch (_) {}

store.on('change:machine', (next, prev) => {
  updateUiState(next);
  const statusIndicator = document.getElementById('chat-header-status');
  const statusText = next === STATE.WORKING ? 'PROCESANDO...'
    : next === STATE.SPEAKING ? 'HABLANDO'
    : next === STATE.LISTENING ? 'ESCUCHANDO'
    : next === STATE.CONNECTING ? 'CONECTANDO'
    : 'SISTEMAS ONLINE';
  if (statusIndicator) statusIndicator.innerText = statusText;
  const diagState = document.getElementById('diag-state');
  if (diagState) diagState.innerText = next.toUpperCase();
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    micBtn.classList.toggle('recording', next === STATE.LISTENING);
  }
  const reactorEl = document.querySelector('.reactor-viewport-area');
  if (reactorEl) {
    reactorEl.classList.toggle('researching', next === STATE.WORKING);
  }
});

store.on('change:toolCount', (count) => {
  const tc = document.getElementById('diag-tool-count');
  if (tc) tc.innerText = `${count}`;
});

function _initWatchdogs() {
  // Deprecado: Toda la lógica de monitoreo de conexión y salud del micrófono
  // ahora es gestionada de manera centralizada por js/system/connection-guardian.js
  // para evitar race conditions y comportamientos erráticos.
  store.set('lastWsMessageTime', Date.now());
}

bus.on('memory:write-requested', (memory) => {
  let timer = memory._debounceTimer;
  if (timer) clearTimeout(timer);
  memory._debounceTimer = setTimeout(async () => {
    try {
      await window.electronAPI.memoryWrite(memory);
    } catch (e) {
      console.error('[MEMORY] Error al guardar:', e.message);
    }
    memory._debounceTimer = null;
  }, 5000);
});

async function _initApp() {
  const _boot = (msg) => {
    const type = msg.startsWith('ERR') || msg.startsWith('Fallo') ? 'error' : 'info';
    if (window.electronAPI?.logToTerminal) {
      window.electronAPI.logToTerminal(type, `[BOOT] ${msg}`);
    } else {
      console.log(`[MAIN] ${msg}`);
    }
  };

  _boot('DOMContentLoaded — iniciando sistemas');
  if (window.electronAPI?.reportBootProgress) {
    window.electronAPI.reportBootProgress(50, 'Inicializando kernel cognitivo...');
  }
  
  // 1. Boot del Kernel antes de cualquier otra cosa
  try {
    await kernel.boot();
    _boot('Kernel central iniciado');
    if (window.electronAPI?.reportBootProgress) {
      window.electronAPI.reportBootProgress(65, 'Kernel central en línea...');
    }
  } catch (e) {
    _boot(`Fallo crítico del Kernel: ${e.message}`);
    if (window.electronAPI?.reportBootError) {
      window.electronAPI.reportBootError(`Fallo crítico en el Kernel: ${e.message}`);
    }
  }
  
  // Partículas dinámicas — se inyectan post-boot para no retrasar el arranque
  requestIdleCallback(() => {
    const pContainer = document.getElementById('main-bg-particles');
    if (!pContainer) return;
    pContainer.innerHTML = '';
    for (let i = 0; i < 35; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${10 + Math.random() * 15}s`;
      p.style.animationDelay = `${Math.random() * 10}s`;
      p.style.width = p.style.height = `${1 + Math.random() * 2}px`;
      pContainer.appendChild(p);
    }
  });

  initErrorReporter();
  initReminderEngine(); // Motor de recordatorios in-app (sin PowerShell, sin Defender)
  const _CREATOR_KEY = 'jarvis_creator_mode';

  // Pre-warm DNS + TLS para Gemini (conexión TCP temprana)

  fetch('config/system_prompt_master.txt').then(r => { if (r.ok) r.text().then(t => { window._cachedMasterPrompt = t; }); }).catch(() => {});
  fetch('config/integrity_protocol.txt').then(r => { if (r.ok) r.text().then(t => { window._cachedIntegrity = t; }); }).catch(() => {});
  _boot('Sistemas preparados');

  if (window.electronAPI?.onTtsState) {
    window.electronAPI.onTtsState(({ speaking }) => {
      store.set('isTtsSpeaking', speaking);
    });
  }
  try {
    initAudio();
    _boot('Audio OK');
    if (window.electronAPI?.reportBootProgress) {
      window.electronAPI.reportBootProgress(80, 'Dispositivos de audio listos...');
    }
  } catch (e) {
    console.warn(`[MAIN] Audio pre-init: ${e.message}`);
    if (window.electronAPI?.logToTerminal) window.electronAPI.logToTerminal('warn', `[BOOT] Audio pre-init: ${e.message}`);
  }
  // Setear proveedor activo en store ANTES de cualquier otra cosa — esto evita que WS se conecte
  store.set('_activeProvider', 'gemini');
  await loadConfig();
  _boot('Config cargada');
  if (window.electronAPI?.reportBootProgress) {
    window.electronAPI.reportBootProgress(90, 'Preferencias y configuración cargadas...');
  }
  try {
    const homeDir = await window.electronAPI?.getHomeDir?.();
    if (homeDir) {
      store.set('homeDir', homeDir);
      _boot(`Carpeta personal detectada: ${homeDir}`);
    }
  } catch (err) {
    console.warn('[BOOT] Error al obtener carpeta personal:', err.message);
  }
  import('./memory/memory-manager.js').then(m => { m.initMemorySystem(); _boot('Memoria vectorial lista'); }).catch(e => console.warn('[MEMORY] init:', e.message));

  let _appStarted = false;
  const _startApp = async () => {
    if (_appStarted) return;
    _appStarted = true;

    // WS connect inmediato (paralelo con JOS.boot + app scan)
    async function _startWS() {
      let hasKey = await window.electronAPI?.checkApiKey().then(r => r.configured).catch(() => false);
      if (!hasKey) {
        const savedGeminiKey = localStorage.getItem('jarvis_gemini_api_key');
        if (savedGeminiKey) {
          const synced = await window.electronAPI?.setupGeminiKey(savedGeminiKey).catch(() => ({ success: false }));
          if (synced?.success) hasKey = true;
        }
      }
      if (hasKey) {
        _boot('API key detectada. Preparando Gemini.');
        connectWebSocket();
      } else {
        _boot('API key no encontrada');
      }
    }
    _startWS();

    // TODO: mover todo esto a un solo Promise.all
    Promise.all([
      JOS.boot().then(() => _boot('JOS v1.0 listo')).catch(e => console.warn(`[MAIN] JOS boot: ${e.message}`)),
      Promise.race([
        loadAppPathCache(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))
      ]).then(() => _boot('AppPathCache OK')).catch(e => {
        const msg = e.message === 'timeout' ? 'AppPathCache timeout (>2s) — continuando' : `AppPathCache: ${e.message}`;
        console.warn(`[MAIN] ${msg}`);
      })
    ]);

    // Estas no necesitan JOS.boot ni AppScan — se ejecutan inmediato
    showInstantGreeting();
    initConnectionGuardian();
    initNetworkMonitor();
    _initWatchdogs();
    _boot('Watchdogs, Guardian y NetworkMonitor activos');
    import('./engines/integration/index.js').then(m => { m.initIntegrations(); import('./engines/integration/ui.js').then(ui => ui.initIntegrationsUI()); });
    _boot('Integraciones inicializadas');
    import('./updater/update-dialog.js').then(m => { m.initUpdaterUI(); }).catch(e => console.warn('[UPDATER] init:', e.message));
    initArtifactsPanel();
    _boot('Artifacts panel OK');
    initWeatherPanel();
    _boot('Weather panel OK');
    initInfoPanel();
    _boot('Info panel OK');
    initPlanPanel();
    _boot('Plan panel OK');

    store.set('startTime', 0);
    store.set('isReconnectingIntentional', false);
  };

  if (window.electronAPI?.reportBootProgress) {
    window.electronAPI.reportBootProgress(95, 'Verificando sesión...');
  }

  onAuth(({ authed, user }) => {
    if (!authed) return;
    if (_appStarted) return;
    _boot(`Autenticado: ${user?.username || 'usuario'}`);
    if (window.electronAPI?.reportBootProgress) {
      window.electronAPI.reportBootProgress(100, 'Inicialización completada');
    }
    _startApp();
  });

  const authOk = await checkAuth();
  if (authOk) {
    if (window.electronAPI?.reportBootProgress) {
      window.electronAPI.reportBootProgress(100, 'Inicialización completada');
    }
    _startApp();
  } else {
    _boot('Esperando inicio de sesión...');
    if (window.electronAPI?.reportBootProgress) {
      window.electronAPI.reportBootProgress(100, 'Sistemas listos para configuración');
    }
  }

  // ─── UI event handlers — siempre se registran aunque no haya auth ──
  document.getElementById('close-btn')?.addEventListener('click', () => window.electronAPI.closeWindow());
  document.getElementById('minimize-btn')?.addEventListener('click', () => window.electronAPI.minimizeWindow());




  // ─── Reconnect ───────────────────────────────────────
  document.getElementById('reconnect-btn')?.addEventListener('click', () => {
    resetGreetingFlag();
    const ws = window.ws;
    if (ws && (ws.readyState === 1 || ws.readyState === 0)) {
      store.set('isReconnectingIntentional', true);
      ws.close();
    } else {
      connectWebSocket();
    }
  });

  // ─── Plan panel toggle ───────────────────────────────
  document.getElementById('plan-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('plan-panel');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    if (!panel.classList.contains('collapsed')) {
      import('./ui/plan-panel.js').then(m => m.refreshPlanPanel());
    }
  });

  // ─── Investigaciones ──────────────────────────────────
  document.getElementById('docs-btn')?.addEventListener('click', () => {
    import('./research/research-modal.js').then(m => m.openResearchModal());
  });

  // ─── New chat ────────────────────────────────────────
  document.getElementById('new-chat-btn')?.addEventListener('click', () => {
    const history = store.get('conversationHistory');
    if (history && history.length > 2 && !confirm('¿Descartar conversación actual?')) return;
    import('./chat/messages.js').then(m => m._resetTurnState());
    store.set('messageCount', 0);
    const diagCount = document.getElementById('diag-msg-count');
    if (diagCount) diagCount.innerText = '0';
    store.set('conversationHistory', []);
    resetGreetingFlag();
    const ws = window.ws;
    if (ws && (ws.readyState === 1 || ws.readyState === 0)) {
      store.set('isReconnectingIntentional', true);
      ws.close();
    } else {
      connectWebSocket();
    }
  });

  // ─── Chat text input & send ──────────────────────────
  const chatTextarea = document.getElementById('chat-text-input');
  const chatSendBtn  = document.getElementById('chat-send-btn');

  async function _sendChatText() {
    if (_pendingImages?.length > 0) {
      const text = chatTextarea?.value?.trim() || '';
      chatTextarea.value = '';
      chatTextarea.style.height = 'auto';
      chatSendBtn?.classList.remove('has-text');
      await _sendChatWithOptionalImage(text);
      return;
    }
    const text = chatTextarea?.value?.trim();
    if (!text) return;
    chatSendBtn?.classList.add('sending');
    const hiddenInput = document.getElementById('text-input');
    if (hiddenInput) hiddenInput.value = text;
    chatTextarea.value = '';
    chatTextarea.style.height = 'auto';
    chatSendBtn?.classList.remove('has-text');
    import('./chat/messages.js').then(m => {
      m.sendTextMessage();
      setTimeout(() => chatSendBtn?.classList.remove('sending'), 1000);
    }).catch(() => chatSendBtn?.classList.remove('sending'));
  }

  chatSendBtn?.addEventListener('click', _sendChatText);

  chatTextarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _sendChatText();
    }
  });

  chatTextarea?.addEventListener('input', () => {
    // Auto-resize
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 120) + 'px';
    // Mostrar botón activo
    if (chatTextarea.value.trim()) {
      chatSendBtn?.classList.add('has-text');
    } else {
      chatSendBtn?.classList.remove('has-text');
    }
  });

  // ─── Mic button (voice input) ─────────────────────────
  const micBtn = document.getElementById('mic-btn');
  micBtn?.addEventListener('click', async () => {
    const { startRecording, stopRecording, isRecording } = await import('./audio/recorder.js');
    _toggleMic(isRecording());
  });

  function _toggleMic(wasRecording) {
    const micBtnEl = document.getElementById('mic-btn');
    if (wasRecording) {
      import('./audio/recorder.js').then(m => m.stopRecording());
      micBtnEl?.classList.remove('recording');
      store.setState(STATE.IDLE);
      window.electronAPI.setMicState(false);
    } else {
      if (store.get('_isProcessingImage')) {
        import('./chat/messages.js').then(m => m.showSystemErrorMessage('Esperá a que termine de analizar la imagen antes de hablar.'));
        return;
      }
      import('./audio/recorder.js').then(m => m.startRecording()).then(ok => {
        if (ok) {
          micBtnEl?.classList.add('recording');
          store.setState(STATE.LISTENING);
          window.electronAPI.setMicState(true);
        }
      });
    }
  }

  // Tray mic toggle
  window.electronAPI.onTrayMicToggle((active) => {
    const btn = document.getElementById('mic-btn');
    if (active) {
      if (store.get('_isProcessingImage')) return;
      import('./audio/recorder.js').then(m => m.startRecording()).then(ok => {
        if (ok) { btn?.classList.add('recording'); store.setState(STATE.LISTENING); }
      });
    } else {
      import('./audio/recorder.js').then(m => m.stopRecording());
      btn?.classList.remove('recording');
      store.setState(STATE.IDLE);
    }
  });

  // ─── YouTube Download Progress ────────────────────────
  window.electronAPI.onYoutubeProgress((data) => {
    const area = document.getElementById('yt-prog-area');
    const fill = document.getElementById('yt-prog-fill');
    const pct = document.getElementById('yt-prog-pct');
    const speed = document.getElementById('yt-prog-speed');
    const eta = document.getElementById('yt-prog-eta');
    const status = document.getElementById('yt-prog-status');
    if (!area || !fill || !pct) return;

    if (data.status === 'complete') {
      fill.style.width = '100%';
      pct.textContent = '100%';
      if (status) status.textContent = 'Descarga completada';
      setTimeout(() => { area.style.display = 'none'; }, 3000);
      return;
    }
    if (data.status === 'error') {
      if (status) status.textContent = 'Error: ' + (data.message || 'desconocido');
      return;
    }

    area.style.display = 'block';
    fill.style.width = (data.percent || 0) + '%';
    pct.textContent = (data.percent || 0) + '%';
    if (speed && data.speed) speed.textContent = data.speed;
    if (eta && data.eta) eta.textContent = 'ETA ' + data.eta;
    if (status && data.message) status.textContent = data.message;
  });

  document.getElementById('yt-prog-close')?.addEventListener('click', () => {
    const a = document.getElementById('yt-prog-area');
    if (a) a.style.display = 'none';
  });

  // ─── Global keyboard shortcuts ────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      document.getElementById('new-chat-btn')?.click();
    }
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      document.getElementById('console-toggle-btn')?.click();
    }
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      document.getElementById('integrations-btn')?.click();
    }
  });

  // ─── File upload ─────────────────────────────────────
  const fileInput = document.getElementById('file-input');
  const attachBtn = document.getElementById('attach-btn');
  const focusFileInput = document.getElementById('focus-file-input');

  fileInput?.addEventListener('change', (e) => {
    _handleFiles(e.target.files);
    e.target.value = '';
  });
  focusFileInput?.addEventListener('change', (e) => {
    _handleFiles(e.target.files);
    e.target.value = '';
  });

  async function _handleFiles(files) {
    if (!files || files.length === 0) return;
    const { sendTextMessage, appendUserMessage, showSystemErrorMessage: showErr } = await import('./chat/messages.js');
    // Primero recolectar imágenes (hasta 2), enviar juntas
    const imageFiles = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) imageFiles.push(file);
    }
    if (imageFiles.length > 0) {
      const toProcess = imageFiles.slice(0, 2);
      if (imageFiles.length > 2) showErr('Máximo 2 imágenes por envío.');
      const images = await Promise.all(toProcess.map(async f => ({
        base64: await _fileToBase64(f),
        mimeType: f.type || 'image/jpeg',
        name: f.name
      })));
      _pendingImages = images;
      _renderImagePreview();
      chatTextarea?.focus();
      return;
    }

    for (const file of files) {
      try {
        const MAX_CHARS = 3000;
        const ext = file.name.split('.').pop().toLowerCase();
        const isAudio = file.type.startsWith('audio/');
        const isText = file.type.startsWith('text/') || ['txt','md','json','csv','log','js','ts','py','html','css','xml','yaml','yml','ini','cfg','env','jsx','tsx','vue','sql','sh','bat','ps1','env'].includes(ext);

        let msgLabel = '';
        let wsContent = '';
        if (isAudio) {
          msgLabel = `[Audio: ${file.name}]`;
          wsContent = `El usuario adjuntó un archivo de audio: "${file.name}" (${file.type || 'audio'}, ${(file.size / 1024).toFixed(1)} KB). Describe brevemente su contenido.`;
          appendUserMessage(msgLabel, msgLabel);
          continue;
        } else if (isText) {
          const text = await file.text();
          const truncated = text.length > MAX_CHARS;
          const content = text.substring(0, MAX_CHARS);
          const sizeInfo = truncated ? ` (mostrando primeros ${MAX_CHARS} de ${text.length} caracteres)` : '';
          msgLabel = `[Archivo: ${file.name}]`;
          appendUserMessage(msgLabel, `${file.name}${sizeInfo}`);
          wsContent = `Archivo adjunto "${file.name}"${sizeInfo}. Haz un resumen breve y responde a lo relevante:\n\n${content}`;
        } else {
          try {
            const text = await file.text();
            const content = text.substring(0, MAX_CHARS);
            msgLabel = `[Archivo: ${file.name}]`;
            appendUserMessage(msgLabel, file.name);
            wsContent = `Archivo "${file.name}" (${file.type || 'tipo desconocido'}):\n\n${content}`;
          } catch {
            showErr(`No se puede leer el archivo: ${file.name}`);
            continue;
          }
        }

        if (wsContent) {
          const ws = window.ws;
          if (ws?.readyState === 1) {
            const turns = (store.get('conversationHistory') || []).slice(-40).map(e => ({ role: e.role === 'user' ? 'user' : 'model', parts: [{ text: e.content }] }));
            turns.push({ role: 'user', parts: [{ text: wsContent }] });
            ws.send(JSON.stringify({
              clientContent: { turns, turnComplete: true }
            }));
            const store2 = (await import('./state/store.js')).store;
            store2.set('startTime', Date.now());
            store2.set('waitingForResponse', true);
          }
        }
      } catch (e) {
        showErr(`Error al leer archivo: ${file.name}`);
      }
    }
  }

  // ─── Drag & drop ─────────────────────────────────────
  const dropZone = document.body;
  let dropCounter = 0;

  function _addDropHandlers(el) {
    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dropCounter++;
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropCounter--;
      if (dropCounter <= 0) { dropCounter = 0; el.classList.remove('drag-over'); }
    });
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      dropCounter = 0;
      el.classList.remove('drag-over');
      _handleFiles(e.dataTransfer.files);
    });
  }
  _addDropHandlers(dropZone);

  // ─── Imágenes (hasta 2 por envío) ─────────────────────
  let _pendingImages = []; // [{ base64, mimeType, name }]

  function _renderImagePreview() {
    const preview = document.getElementById('chat-image-preview');
    const thumbs = document.getElementById('chat-img-thumbs');
    if (!preview || !thumbs) return;
    if (_pendingImages.length === 0) { preview.style.display = 'none'; return; }
    thumbs.innerHTML = '';
    const maxThumbs = Math.min(_pendingImages.length, 2);
    for (let i = 0; i < maxThumbs; i++) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;flex-shrink:0;';
      const img = document.createElement('img');
      img.src = `data:${_pendingImages[i].mimeType};base64,${_pendingImages[i].base64}`;
      img.alt = _pendingImages[i].name;
      img.style.cssText = 'height:44px;width:44px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.1);';
      wrap.appendChild(img);
      thumbs.appendChild(wrap);
    }
    preview.style.display = 'flex';
  }

  function _clearImagePreview() {
    _pendingImages = [];
    const preview = document.getElementById('chat-image-preview');
    if (preview) preview.style.display = 'none';
    const imgFileInput = document.getElementById('chat-image-file-input');
    if (imgFileInput) imgFileInput.value = '';
  }

  document.getElementById('chat-img-remove')?.addEventListener('click', _clearImagePreview);

  attachBtn?.addEventListener('click', () => {
    document.getElementById('chat-image-file-input')?.click();
  });

  function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const b64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(b64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Comprimir imagen a JPEG 50% con resize a máximo 1024px
  function _compressImage(b64, mimeType) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.5).split(',')[1]);
      };
      img.onerror = () => resolve(b64);
      img.src = `data:${mimeType};base64,${b64}`;
    });
  }

  // Selección de imagen(es) → preview, espera texto + Enter (máx 2)
  document.getElementById('chat-image-file-input')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 2);
    if (files.length === 0) return;
    try {
      const images = await Promise.all(files.map(async f => ({
        base64: await _fileToBase64(f),
        mimeType: f.type || 'image/jpeg',
        name: f.name
      })));
      _pendingImages = images;
      _renderImagePreview();
    } catch (err) {
      console.error('[IMG] Error reading file:', err);
    }
    e.target.value = '';
  });

  // Ctrl+V en portapapeles → agrega a preview (máx 2)
  document.getElementById('chat-text-input')?.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/') && _pendingImages.length < 2) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        try {
          const b64 = await _fileToBase64(file);
          const mt = item.type || 'image/png';
          _pendingImages.push({
            base64: b64,
            mimeType: mt,
            name: `imagen_pegada.${mt.split('/')[1] || 'png'}`
          });
          _renderImagePreview();
        } catch (err) {
          console.error('[IMG] Error reading clipboard image:', err);
        }
        return;
      }
    }
  });

  // Enviar imágenes pendientes a Gemini
  async function _sendChatWithOptionalImage(text) {
    if (_pendingImages.length === 0) return;
    const { appendUserMessage, handleJarvisTranscriptInstant } = await import('./chat/messages.js');
    const names = _pendingImages.map(i => i.name).join(', ');
    const label = text ? `${text} [📷 ${names}]` : `[📷 ${names}]`;
    const userPrompt = text || `Analiza ${_pendingImages.length > 1 ? 'estas ' + _pendingImages.length + ' imágenes' : 'esta imagen'}: "${names}"`;
    appendUserMessage(label, label);

    // Bloquear micrófono mientras se procesa la imagen
    store.set('_isProcessingImage', true);
    // Activar indicador de análisis en el logo + indicator
    const indicator = document.getElementById('msg-indicator');
    if (indicator) {
      indicator.className = 'msg-indicator active processing';
      indicator.innerHTML = '<span>Analizando imagen…</span>';
    }
    store.set('_turnState', 'thinking');
    store.set('_thinkingPhaseStartTime', Date.now());
    store.set('waitingForResponse', true);
    store.setState(STATE.SPEAKING);

    // Comprimir imágenes a JPEG 50% (máx 1024px) para ahorrar cuota
    const compressedParts = [{ text: userPrompt }];
    for (const img of _pendingImages) {
      const compressed = await _compressImage(img.base64, img.mimeType || 'image/jpeg');
      compressedParts.push({ inlineData: { mimeType: 'image/jpeg', data: compressed } });
    }
    const IMG_INSTRUCTION = `Sos JARVIS, el asistente personal. Acabás de recibir una imagen. Respondé en español, de forma natural y CONCISA (máximo 150 palabras).
1) Contá en 1-3 frases qué muestra la imagen (lo esencial: qué es, qué se ve).
2) Respondé directamente a la petición del usuario sobre la imagen (usarla como fondo de pantalla, compartirla, analizarla, describirla, etc.). Si pidió una acción, decí qué harías o qué necesitás para hacerla.
NO hagas análisis técnico extenso, NO listes detalles innecesarios, NO repitas la descripción. Directo al punto, como una persona.`;
    const wallpaperIntent = /(fondo de pantalla|fondo de escritorio|wallpaper|como fondo)/i.test(text || '');
    const imgInstruction = wallpaperIntent
      ? IMG_INSTRUCTION + `\n3) El usuario pidió usar la imagen como fondo de pantalla: se aplicará automáticamente al escritorio de Windows. Confirmalo con naturalidad al final, sin pedir permisos ni más datos.`
      : IMG_INSTRUCTION;
    try {
      if (window.electronAPI?.geminiTextChat) {
        const history = store.get('conversationHistory') || [];
        const apiMsgs = history.slice(-40).map(e => ({ role: e.role === 'user' ? 'user' : 'model', parts: [{ text: e.content }] }));
        apiMsgs.push({ role: 'user', parts: compressedParts });
        // Guardar el mensaje del usuario en el historial para continuidad
        history.push({ role: 'user', content: label });
        store.set('conversationHistory', [...history]);
        const result = await window.electronAPI.geminiTextChat({ messages: apiMsgs, systemInstruction: imgInstruction });
        if (result.success) {
          const h = store.get('conversationHistory');
          h.push({ role: 'model', content: result.response });
          store.set('conversationHistory', [...h]);
          // Restaurar indicator normal de speaking
          if (indicator) {
            indicator.className = 'msg-indicator active speaking';
            indicator.innerHTML = '';
            for (let i = 0; i < 3; i++) {
              const bar = document.createElement('span');
              bar.style.animationDelay = (i * 0.12) + 's';
              indicator.appendChild(bar);
            }
          }
          // Aplicar la imagen como fondo de pantalla si el usuario lo pidió
          let finalResponse = result.response;
          if (wallpaperIntent && _pendingImages.length > 0) {
            try {
              const img = _pendingImages[0];
              const ext = (img.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
              const home = await window.electronAPI?.getHomeDir?.() || 'C:\\Users\\Admin';
              const outPath = `${home}\\Pictures\\JARVIS_Wallpaper_${Date.now()}.${ext}`;
              const saved = await window.electronAPI.saveImageFile({ base64: img.base64, filePath: outPath });
              if (saved?.success) {
                const wp = await window.electronAPI.setWallpaper('url', outPath);
                if (wp?.success) {
                  finalResponse += `\n\n🖥️ Listo, ya quedó como fondo de pantalla.`;
                } else {
                  finalResponse += `\n\n⚠️ No pude aplicar el fondo: ${(wp && wp.output) || 'error desconocido'}`;
                }
              } else {
                finalResponse += `\n\n⚠️ No pude guardar la imagen: ${(saved && saved.error) || 'error desconocido'}`;
              }
            } catch (e) {
              finalResponse += `\n\n⚠️ Error al aplicar el fondo: ${e.message}`;
            }
          }
          handleJarvisTranscriptInstant(finalResponse);
          // Guardar en memoria vectorial para que Jarvis lo recuerde después
          import('./memory/memory-manager.js').then(m => m.storeTurn(label, finalResponse)).catch(() => {});
          // Auto-guardar como fact importante (horarios, listas, info personal)
          import('./memory/facts.js').then(f => {
            f.saveFact('schedule', `Análisis de imagen del usuario: ${finalResponse.substring(0, 1000)}`, 'high');
          }).catch(() => {});
          // Hablar la respuesta con la voz de Gemini (mismo pipeline que el WS)
          import('./audio/playback.js').then(m => m.speakWithGeminiVoice(finalResponse));
        } else {
          const { showSystemErrorMessage } = await import('./chat/messages.js');
          showSystemErrorMessage(`Error al analizar imagen: ${result.error}`);
        }
      } else {
        const { showSystemErrorMessage } = await import('./chat/messages.js');
        showSystemErrorMessage('geminiTextChat no disponible para analizar imagen');
      }
    } catch (err) {
      const { showSystemErrorMessage } = await import('./chat/messages.js');
      showSystemErrorMessage(`Error al analizar imagen: ${err.message}`);
    }
    store.set('_isProcessingImage', false);
    store.set('waitingForResponse', false);
    store.setState(STATE.IDLE);
    _clearImagePreview();
  }

  // ─── Toggle campana de recordatorios ──────────────────
  document.getElementById('reminders-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('reminders-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display !== 'none';
    dropdown.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      import('./system/reminders.js').then(m => {
        m._updateRemindersUI();
      });
    }
  });
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('reminders-dropdown');
    const panel = document.getElementById('reminders-panel');
    if (dropdown && panel && !panel.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });


  document.getElementById('console-toggle-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('right-panel');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    const btn = document.getElementById('console-toggle-btn');
    if (btn) btn.textContent = panel.classList.contains('collapsed') ? '◀' : '▶';
  });

  // ─── Prompts (modal que se actualiza, botón en la esquina) ───
  let _lastPrompt = null;
  try {
    const stored = localStorage.getItem('jarvis_last_prompt');
    if (stored) _lastPrompt = JSON.parse(stored);
  } catch {}

  function _renderPromptModal(entry) {
    if (!entry) return;
    document.getElementById('pm-title').textContent = entry.title || 'Prompt';
    document.getElementById('pm-text').textContent = entry.prompt;
    const linksWrap = document.getElementById('pm-links');
    linksWrap.innerHTML = '';
    if (entry.links && entry.links.length > 0) {
      for (const link of entry.links) {
        const a = document.createElement('a');
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = link;
        linksWrap.appendChild(a);
      }
      linksWrap.style.display = 'flex';
    } else {
      linksWrap.style.display = 'none';
    }
  }

  function _openPromptModal() {
    if (!_lastPrompt) return;
    _renderPromptModal(_lastPrompt);
    document.getElementById('prompt-modal').style.display = 'flex';
  }

  function _closePromptModal() {
    document.getElementById('prompt-modal').style.display = 'none';
  }

  document.getElementById('prompt-reopen-btn')?.addEventListener('click', _openPromptModal);
  document.getElementById('pm-close-btn')?.addEventListener('click', _closePromptModal);
  document.getElementById('prompt-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'prompt-modal') _closePromptModal();
  });
  document.getElementById('pm-copy-btn')?.addEventListener('click', () => {
    if (!_lastPrompt) return;
    navigator.clipboard.writeText(_lastPrompt.prompt).then(() => {
      const btn = document.getElementById('pm-copy-btn');
      btn.classList.add('copied');
      btn.querySelector('span').textContent = '✓ Copiado';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.querySelector('span').textContent = 'Copiar prompt';
      }, 2000);
    }).catch(() => {});
  });

  bus.on('prompt:new', (entry) => {
    _lastPrompt = entry;
    try { localStorage.setItem('jarvis_last_prompt', JSON.stringify(entry)); } catch {}
    document.getElementById('prompt-reopen-btn').style.display = 'flex';
    _openPromptModal();
  });
  if (_lastPrompt) document.getElementById('prompt-reopen-btn').style.display = 'flex';

  // ─── Links de búsqueda web (integrados inline en la respuesta de JARVIS) ───
  function _hideInlineLinks() {
    const el = document.getElementById('msg-web-links');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }
  bus.on('ui:links-hide', _hideInlineLinks);
  bus.on('web:links', (links) => {
    const el = document.getElementById('msg-web-links');
    if (!el || !Array.isArray(links) || links.length === 0) return;
    el.innerHTML = '';
    for (const link of links.slice(0, 5)) {
      const a = document.createElement('a');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'msg-web-link-chip';
      // favicon de Google
      const favicon = document.createElement('img');
      try {
        const host = new URL(link).hostname;
        favicon.src = `https://www.google.com/s2/favicons?domain=${host}&sz=16`;
      } catch { favicon.src = ''; }
      favicon.width = 12;
      favicon.height = 12;
      favicon.style.borderRadius = '2px';
      favicon.onerror = () => { favicon.style.display = 'none'; };
      const label = document.createElement('span');
      try {
        label.textContent = new URL(link).hostname.replace(/^www\./, '');
      } catch { label.textContent = link; }
      a.appendChild(favicon);
      a.appendChild(label);
      el.appendChild(a);
    }
    el.style.display = 'flex';
  });

  // ─── Dev console toggle ──────────────────────────────
  document.getElementById('dev-console-btn')?.addEventListener('click', () => {
    toggleDevConsole();
  });


  // ─── Supervisor report ───────────────────────────────
  document.getElementById('supervisor-btn')?.addEventListener('click', () => {
    if (!window.JarvisSupervisor) {
      showSystemErrorMessage('Supervisor no disponible.');
      return;
    }
    const report = window.JarvisSupervisor.generateReport();
    const prompt = window.JarvisSupervisor.exportPrompt();
    const reportStr = [
      `[SUPERVISOR REPORT]`,
      `Sesion: ${report.sessionId}`,
      `Uptime: ${report.uptime}`,
      `Estado: ${report.currentState}`,
      `\nMetricas:`,
      ...Object.entries(report.metrics).map(([k, v]) => `  ${k}: ${v}`)
    ].join('\n');
    appendCommandResult('Supervisor Report', reportStr);
  });

  // ─── Theme toggle ────────────────────────────────────
  document.getElementById('theme-toggle-config')?.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'light' : 'dark';
    localStorage.setItem('jarvis_theme', theme);
    applyTheme(theme);
    updateThemeUI(theme);
  });

  // ─── Modal tabs ──────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-tab'))?.classList.add('active');
    });
  });

  // ─── Config modal ────────────────────────────────────
  document.getElementById('config-trigger')?.addEventListener('click', () => {
    document.getElementById('config-modal')?.classList.add('active');
    const get = (id, fallback) => localStorage.getItem(id) || fallback;
    document.getElementById('username-input').value = get('jarvis_username', '');
    document.getElementById('title-input').value = get('jarvis_title', '');
    document.getElementById('lang-select').value = get('jarvis_lang', 'es');
    document.getElementById('personality-select').value = get('jarvis_personality', 'professional');
    document.getElementById('voice-select').value = get('jarvis_voice', 'Fenrir');
    document.getElementById('length-select').value = get('jarvis_length', 'normal');
    document.getElementById('font-size-slider').value = get('jarvis_fontsize', '2');
    document.getElementById('city-input').value = get('jarvis_city', '');
    document.getElementById('rules-textarea').value = get('jarvis_rules', '');
    document.getElementById('context-textarea').value = get('jarvis_context', '');
    const vadSlider = document.getElementById('vad-slider');
    if (vadSlider) vadSlider.value = localStorage.getItem('jarvis_vad_threshold') || '300';
    const interruptToggle = document.getElementById('interrupt-toggle');
    if (interruptToggle) interruptToggle.checked = localStorage.getItem('jarvis_interrupt_mode') !== 'false';
    const gfxSelect = document.getElementById('graphics-select');
    if (gfxSelect) gfxSelect.value = localStorage.getItem('jarvis_graphics') || 'high';
    const googleApiKeyInput = document.getElementById('config-google-api-key');
    if (googleApiKeyInput) googleApiKeyInput.value = localStorage.getItem('jarvis_google_api_key') || '';
    const googleCxInput = document.getElementById('config-google-cx');
    if (googleCxInput) googleCxInput.value = localStorage.getItem('jarvis_google_cx') || '';
    document.getElementById('clear-confirm-span').style.display = 'none';
    document.getElementById('clear-btn').style.display = 'inline-block';
    initOllamaConfigUI();
  });
  document.getElementById('user-badge')?.addEventListener('click', () => {
    document.getElementById('config-trigger')?.click();
  });
  document.getElementById('modal-close')?.addEventListener('click', () => closeModal(document.getElementById('config-modal')));
  document.getElementById('config-cancel-btn')?.addEventListener('click', () => closeModal(document.getElementById('config-modal')));
  document.getElementById('config-save-btn')?.addEventListener('click', async () => {
    const needsReconnect = await saveConfig();
    if (needsReconnect) {
      const ws = window.ws;
      if (ws) {
        store.set('isReconnectingIntentional', true);
        if (ws.readyState !== 3) {
          ws.onclose = () => { store.set('isReconnectingIntentional', false); connectWebSocket(); };
          ws.close();
        } else { connectWebSocket(); }
      } else { connectWebSocket(); }
    }
  });

  // ─── Export chat ─────────────────────────────────────
  document.getElementById('export-chat-btn')?.addEventListener('click', async () => {
    const history = store.get('conversationHistory') || [];
    if (history.length === 0) {
      showSystemErrorMessage('No hay conversación para exportar.');
      return;
    }
    let md = `# Conversación con JARVIS\n\n_Fecha: ${new Date().toLocaleString('es')}_\n\n---\n\n`;
    for (const msg of history) {
      const role = msg.role === 'user' ? '**Tú**' : '**JARVIS**';
      md += `### ${role}\n${msg.content}\n\n---\n\n`;
    }
    const result = await window.electronAPI?.saveFileDialog({
      defaultName: `jarvis-conversacion-${Date.now()}.md`,
      content: md
    });
    if (result?.success) {
      showSystemErrorMessage(`✓ Conversación exportada a:\n${result.filePath}`);
    } else if (result && !result.canceled) {
      showSystemErrorMessage(`✗ Error al exportar: ${result.error}`);
    }
  });

  // ─── Sync apps ──────────────────────────────────────
  document.getElementById('sync-apps-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('sync-apps-btn');
    const resultEl = document.getElementById('sync-apps-result');
    if (!btn || !resultEl) return;
    btn.disabled = true;
    btn.textContent = '🔄 Sincronizando...';
    resultEl.style.display = 'inline';
    resultEl.textContent = 'Escaneando aplicaciones instaladas...';
    try {
      const res = await rebuildAppsCatalog();
      const total = res && typeof res === 'object' ? res.total : res;
      const added = res && typeof res === 'object' ? res.added : 0;
      const purged = res && typeof res === 'object' ? res.purged : 0;
      let msg;
      if (added > 0 && purged > 0) msg = `✓ ${added} apps nuevas añadidas, ${purged} obsoletas limpiadas (${total} en total)`;
      else if (added > 0) msg = `✓ ${added} apps nuevas añadidas (${total} en total)`;
      else if (purged > 0) msg = `✓ ${purged} apps obsoletas limpiadas (${total} en total)`;
      else msg = `✓ Catálogo sincronizado (${total} apps en total)`;
      resultEl.textContent = msg;
      resultEl.style.color = '#00ff88';
    } catch (e) {
      resultEl.textContent = `✗ Error: ${e.message}`;
      resultEl.style.color = '#ff4444';
    }
    btn.disabled = false;
    btn.textContent = '🔄 Sincronizar aplicaciones';
    setTimeout(() => { resultEl.style.display = 'none'; }, 5000);
  });

  // ─── Clear chat ──────────────────────────────────────
  document.getElementById('clear-btn')?.addEventListener('click', () => {
    document.getElementById('clear-confirm-span').style.display = 'inline-flex';
    document.getElementById('clear-btn').style.display = 'none';
  });
  document.getElementById('confirm-no-btn')?.addEventListener('click', () => {
    document.getElementById('clear-confirm-span').style.display = 'none';
    document.getElementById('clear-btn').style.display = 'inline-block';
  });
  document.getElementById('confirm-yes-btn')?.addEventListener('click', () => {
    store.set('messageCount', 0);
    const diagMsg = document.getElementById('diag-msg-count');
    if (diagMsg) diagMsg.innerText = '0';
    import('./chat/messages.js').then(m => m._resetTurnState());
    store.set('conversationHistory', []);
    document.getElementById('clear-confirm-span').style.display = 'none';
    document.getElementById('clear-btn').style.display = 'inline-block';
    closeModal(document.getElementById('config-modal'));
    showSystemErrorMessage('Conversacion reiniciada. Sistemas en linea.');
  });

  // ─── System status ───────────────────────────────────
  document.getElementById('sys-status-btn')?.addEventListener('click', async () => {
    appendSystemMessage('Obteniendo estado del sistema...');
    const cmd = [
      '$os = Get-CimInstance Win32_OperatingSystem;',
      '$ram = [Math]::Round($os.FreePhysicalMemory / 1024, 2);',
      '$drive = Get-CimInstance Win32_Volume -Filter \'DriveLetter = "C:"\' -ErrorAction SilentlyContinue;',
      'if (-not $drive) { $drive = Get-PSDrive C };',
      '$used = [Math]::Round(($drive.Capacity - $drive.FreeSpace) / 1GB, 2);',
      'if (-not $used -or $used -le 0) { $used = [Math]::Round($drive.Used / 1GB, 2) };',
      '$free = [Math]::Round($drive.FreeSpace / 1GB, 2);',
      'if (-not $free -or $free -le 0) { $free = [Math]::Round($drive.Free / 1GB, 2) };',
      '$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike \'*Loopback*\' -and $_.IPAddress -notlike \'169.254.*\'}).IPAddress | Select-Object -First 1;',
      '"Host: $($os.CSName)\\nOS: $($os.Caption)\\nRAM Libre: $ram MB\\nDisco C: ${used}GB Usado / ${free}GB Libre\\nIP Local: $ip"'
    ].join(' ');
    const res = await window.electronAPI.runPowerShell(cmd);
    if (res.success) appendCommandResult('Estado del Sistema', res.output);
    else showSystemErrorMessage('Error al obtener estado: ' + res.output);
  });

  // ─── Screenshot ──────────────────────────────────────
  document.getElementById('screenshot-btn')?.addEventListener('click', async () => {
    appendSystemMessage('Tomando captura...');
    const cmd = [
      'Add-Type -AssemblyName System.Windows.Forms, System.Drawing;',
      '$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
      '$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height);',
      '$graphics = [System.Drawing.Graphics]::FromImage($bitmap);',
      '$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size);',
      '$path = "$env:USERPROFILE\\Desktop\\JARVIS_screenshot_$(Get-Date -Format \'yyyyMMdd_HHmmss\').png";',
      '$bitmap.Save($path);',
      '"Captura guardada en: $path"'
    ].join(' ');
    const res = await window.electronAPI.runPowerShell(cmd);
    if (res.success) {
      appendSystemMessage('Captura guardada en el Escritorio.');
      appendCommandResult('Captura de Pantalla', res.output);
    } else showSystemErrorMessage('Error al tomar captura: ' + res.output);
  });

  // ─── Context menu ───────────────────────────────────
  const ctxMenu = document.getElementById('context-menu');
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ctxMenu) {
      ctxMenu.classList.add('visible');
      ctxMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
      ctxMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
    }
  });
  document.addEventListener('click', () => ctxMenu?.classList.remove('visible'));
  document.getElementById('ctx-new-chat')?.addEventListener('click', () => {
    document.getElementById('new-chat-btn')?.click();
    ctxMenu?.classList.remove('visible');
  });
  document.getElementById('ctx-export')?.addEventListener('click', () => {
    exportChat();
    ctxMenu?.classList.remove('visible');
  });

  document.getElementById('ctx-config')?.addEventListener('click', () => {
    document.getElementById('config-trigger')?.click();
    ctxMenu?.classList.remove('visible');
  });

  // ─── Model Manager ──────────────────────────────────
  import('./system/model-manager.js').then(mm => {
    window.modelManager = mm;
    mm.initModelUI();
    mm.syncSidebarStatus();
    setInterval(() => mm.syncSidebarStatus(), 5000);
  });

  // ─── Sidebar Drawer (Menú táctico columna lateral) ───
  const sidebar = document.getElementById('sidebar-drawer');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const closeBtn = document.getElementById('drawer-close-btn');
  
  if (sidebar && toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
  if (sidebar && closeBtn) {
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }
  // Cerrar al hacer click afuera de la columna
  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== toggleBtn) {
        sidebar.classList.remove('open');
      }
    }
  });

}

// ─── Global error handlers (previene pantalla blanca) ─────────────────────
window.addEventListener('error', (e) => {
  console.error('[GLOBAL ERROR]', e.error || e.message || e);
  if (window.electronAPI?.logToTerminal)
    window.electronAPI.logToTerminal('error', `[GLOBAL ERROR] ${e.error?.message || e.message || 'unknown'}`);
  e.preventDefault();
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e.reason?.message || e.reason || 'unknown');
  if (window.electronAPI?.logToTerminal)
    window.electronAPI.logToTerminal('error', `[UNHANDLED REJECTION] ${e.reason?.message || e.reason || 'unknown'}`);
  e.preventDefault();
});

// ─── Boot: safe against ES-module / DOMContentLoaded race ──────────────────
// ES modules are deferred, so DOMContentLoaded *may* have already fired by
// the time this script evaluates. Check readyState before adding the listener.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    _initApp().catch(err => {
      console.error('[MAIN] Error crítico en arranque:', err);
      if (window.electronAPI?.logToTerminal)
        window.electronAPI.logToTerminal('error', `[BOOT CRASH] ${err?.message || err}`);
    });
  });
} else {
  // DOM already ready — call directly
  _initApp().catch(err => {
    console.error('[MAIN] Error crítico en arranque:', err);
    if (window.electronAPI?.logToTerminal)
      window.electronAPI.logToTerminal('error', `[BOOT CRASH] ${err?.message || err}`);
  });
}

window.addEventListener('beforeunload', () => {
  stopConnectionGuardian();
  cleanupWs();
  const ac = document.querySelector('audio')?.context;
  if (ac && ac.state !== 'closed') ac.close();
  import('./audio/recorder.js').then(m => m.cleanupRecorder()).catch(() => {});
});
