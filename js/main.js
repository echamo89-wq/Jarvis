import { store } from './state/store.js';
import { STATE, EVENTS } from './state/constants.js';
import { bus } from './utils/event-bus.js';
import { loadConfig, saveConfig, toggleTheme, applyTheme, updateThemeUI, exportConversation as exportChat, applyAnimations, closeModal } from './config/index.js';
import { initAudio } from './audio/playback.js';
import { toggleMicrophone, prewarmAudio } from './audio/recorder.js';
import { initCanvasVisualizer } from './audio/visualizer.js';
import { sendTextMessage, showSystemErrorMessage, appendSystemMessage, appendCommandResult, _resetTurnState, showInstantGreeting } from './chat/messages.js';
import { updateDiagnostics, updateUiState, startProcessMonitor } from './chat/diagnostics.js';
import { connectWebSocket, cleanup as cleanupWs } from './Core/Connection/manager.js';
import { resetGreetingFlag } from './Core/Connection/handler.js';
import { initConnectionGuardian, stopConnectionGuardian } from './system/connection-guardian.js';
import { loadAppPathCache } from './system/apps.js';
import { checkAuth, onAuth } from './auth/index.js';
import { initArtifactsPanel } from './documents/artifacts.js';
import { initWeatherPanel } from './weather/forecast-panel.js';
import { initInfoPanel, showInfoPanel } from './ui/info-panel.js';
import { JOS } from './engines/index.js';
import './system/supervisor.js';
import { initErrorReporter } from './system/error-reporter.js';

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
    micBtn.classList.toggle('active', next === STATE.LISTENING);
  }
  const recInd = document.getElementById('rec-indicator');
  if (recInd) recInd.style.display = next === STATE.LISTENING ? 'inline-flex' : 'none';
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
    if (window.electronAPI?.logToTerminal) window.electronAPI.logToTerminal('info', `[BOOT] ${msg}`);
    console.log(`[MAIN] ${msg}`);
  };

  _boot('DOMContentLoaded — iniciando sistemas');
  
  // Inyección de partículas dinámicas para fondo futurista
  const pContainer = document.getElementById('main-bg-particles');
  if (pContainer) {
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
  }

  initErrorReporter();
  const _CREATOR_KEY = 'jarvis_creator_mode';

  // Pre-warm DNS + TLS para Gemini (conexión TCP temprana)

  fetch('config/system_prompt_master.txt').then(r => { if (r.ok) window._cachedMasterPrompt = r.text(); }).catch(() => {});
  fetch('config/integrity_protocol.txt').then(r => { if (r.ok) window._cachedIntegrity = r.text(); }).catch(() => {});
  import('./audio/recorder.js').then(m => m.prewarmAudio()).catch(() => {});
  initCanvasVisualizer();
  _boot('CanvasVisualizer OK');

  if (window.electronAPI?.onTtsState) {
    window.electronAPI.onTtsState(({ speaking }) => {
      store.set('isTtsSpeaking', speaking);
    });
  }
  try {
    initAudio();
    _boot('Audio OK');
  } catch (e) {
    console.warn(`[MAIN] Audio pre-init: ${e.message}`);
    if (window.electronAPI?.logToTerminal) window.electronAPI.logToTerminal('warn', `[BOOT] Audio pre-init: ${e.message}`);
  }
  await loadConfig();
  _boot('Config cargada');

  async function _waitBackendReady(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const resp = await fetch('http://localhost:3001/api/health', { cache: 'no-store' });
        if (resp.ok) return true;
      } catch (e) {
        // ignore until service is ready
      }
      await new Promise(res => setTimeout(res, 500));
    }
    console.warn('[MAIN] Backend no listo tras', timeoutMs, 'ms');
    return false;
  }

  // El backend se verifica en segundo plano de manera asíncrona para no retrasar el inicio de la app (arranque instantáneo en < 1s)
  _waitBackendReady(15000).then(ready => {
    if (!ready) {
      _boot('Backend no disponible, la autenticación puede tardar en guardarse');
    } else {
      _boot('Backend listo');
    }
  });

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
    _initWatchdogs();
    startProcessMonitor();
    _boot('Watchdogs y Monitor activos');
    import('./integrations/index.js').then(m => { m.initIntegrations(); import('./integrations/ui.js').then(ui => ui.initIntegrationsUI()); });
    _boot('Integraciones inicializadas');
    initArtifactsPanel();
    _boot('Artifacts panel OK');
    initWeatherPanel();
    _boot('Weather panel OK');
    initInfoPanel();
    _boot('Info panel OK');

    store.set('startTime', 0);
    store.set('isReconnectingIntentional', false);
    store.set('lastMicEnergy', 0);
  };

  onAuth(({ authed, user }) => {
    if (!authed) return;
    if (_appStarted) return;
    _boot(`Autenticado: ${user?.username || 'usuario'}`);
    _startApp();
  });

  const authOk = await checkAuth();
  if (authOk) {
    _startApp();
  } else {
    _boot('Esperando inicio de sesión...');
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

  // ─── Mic button ──────────────────────────────────────
  document.getElementById('mic-btn')?.addEventListener('click', () => {
    toggleMicrophone(false, true);
  });

  // ─── Chat text input & send ──────────────────────────
  const chatTextarea = document.getElementById('chat-text-input');
  const chatSendBtn  = document.getElementById('chat-send-btn');

  function _sendChatText() {
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

  // ─── Global keyboard shortcuts ────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'm') {
      e.preventDefault();
      import('./audio/recorder.js').then(m => m.toggleMicrophone()).catch(() => {});
    }
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

  attachBtn?.addEventListener('click', () => fileInput?.click());
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
    for (const file of files) {
      try {
        const MAX_CHARS = 3000;
        const ext = file.name.split('.').pop().toLowerCase();
        const isImage = file.type.startsWith('image/');
        const isAudio = file.type.startsWith('audio/');
        const isText = file.type.startsWith('text/') || ['txt','md','json','csv','log','js','ts','py','html','css','xml','yaml','yml','ini','cfg','env','jsx','tsx','vue','sql','sh','bat','ps1','env'].includes(ext);

        let msgLabel = '';
        let wsContent = '';

        if (isImage) {
          const buffer = await file.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          msgLabel = `[Imagen: ${file.name}]`;
          appendUserMessage(msgLabel, msgLabel);
          const ws = window.ws;
          if (ws?.readyState === 1) {
            ws.send(JSON.stringify({
              clientContent: {
                turns: [{ role: 'user', parts: [
                  { text: `Analiza esta imagen adjuntada: "${file.name}". Describe su contenido y responde a lo que sea relevante.` },
                  { inlineData: { mimeType: file.type, data: b64 } }
                ]}],
                turnComplete: true
              }
            }));
          }
        } else if (isAudio) {
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
            ws.send(JSON.stringify({
              clientContent: { turns: [{ role: 'user', parts: [{ text: wsContent }] }], turnComplete: true }
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

  store.set('alwaysListen', false);

  // ─── Right panel (diagnóstico) toggle ────────────────
  document.getElementById('console-toggle-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('right-panel');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    const btn = document.getElementById('console-toggle-btn');
    if (btn) btn.textContent = panel.classList.contains('collapsed') ? '◀' : '▶';
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
    document.getElementById('sfx-toggle').checked = localStorage.getItem('jarvis_sfx') !== 'false';

    document.getElementById('anim-toggle').checked = localStorage.getItem('jarvis_anims') !== 'false';
    document.getElementById('city-input').value = get('jarvis_city', '');
    document.getElementById('rules-textarea').value = get('jarvis_rules', '');
    document.getElementById('context-textarea').value = get('jarvis_context', '');
    const vadSlider = document.getElementById('vad-slider');
    if (vadSlider) vadSlider.value = localStorage.getItem('jarvis_vad_threshold') || '300';
    document.getElementById('clear-confirm-span').style.display = 'none';
    document.getElementById('clear-btn').style.display = 'inline-block';
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

  // ─── Thinking panel toggle ───────────────────────────
  document.getElementById('thinking-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('thinking-body');
    const icon = document.querySelector('#thinking-toggle .toggle-icon');
    if (body && icon) {
      body.classList.toggle('collapsed');
      icon.innerText = body.classList.contains('collapsed') ? 'A' : 'V';
    }
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
}

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
  import('./audio/recorder.js').then(m => {
    const rc = m.getRecordingContext?.();
    if (rc && rc.state !== 'closed') rc.close();
  }).catch(() => {});
});
