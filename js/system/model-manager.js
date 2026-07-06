import { store } from '../state/store.js';
import { bus } from '../utils/event-bus.js';
import { appendAuditLog } from '../chat/diagnostics.js';

let _mode = 'cloud';
let _localModel = null;
let _installedModels = [];
let _pullTimer = null;
let _isDownloading = false;       // Mutex: una descarga a la vez
let _audioRestartLog = false;     // Bandera: reinicio de audio detectado
let _scanState = 'inactive';      // 'inactive' | 'scanning' | 'found' | 'empty' | 'error'
let _scanCount = 0;

export function getMode() { return _mode; }
export function isLocal() { return _mode === 'local'; }
export function isDownloading() { return _isDownloading; }
export function getAudioRestartLog() { return _audioRestartLog; }
export function setAudioRestartLog(v) { _audioRestartLog = v; }
export function getLocalModel() { return _localModel; }
export function getScanState() { return _scanState; }

// ─── Ollama API ─────────────────────────────────────────────
const OLLAMA_BASE = 'http://localhost:11434';

async function _ollamaFetch(path, body) {
  try {
    const res = await fetch(`${OLLAMA_BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(body ? 120000 : 5000)
    });
    if (!res.ok) return null;
    return body ? res : await res.json();
  } catch { return null; }
}

export async function askLocalModel(prompt) {
  if (!_localModel) return null;
  let fullText = '';
  await askLocalModelStream(prompt, (token) => { fullText += token; });
  return fullText || null;
}

// ─── Streaming Ollama (token por token) ─────────────────────
export async function askLocalModelStream(prompt, onToken) {
  if (!_localModel) return;
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: _localModel,
        prompt,
        stream: true,
        options: { temperature: 0.7, num_predict: 2048 }
      })
    });
    if (!res.ok) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.response) onToken(chunk.response);
          if (chunk.done) return;
        } catch {}
      }
    }
  } catch (e) {
    console.error('[OLLAMA STREAM]', e.message);
  }
}

// ─── Detect installed models ────────────────────────────────
async function _refreshInstalledModels() {
  const data = await _ollamaFetch('/api/tags');
  _installedModels = data?.models?.map(m => m.name) || [];
  return _installedModels;
}

// ─── UI ─────────────────────────────────────────────────────
export function initModelUI() {
  const modalBody = document.querySelector('#tab-jarvis');
  if (!modalBody) return;

  const html = `
    <div class="model-switch-row">
      <div class="model-switch-label">
        Motor de IA
        <small>CLOUD (Gemini API) · LOCAL (Ollama en localhost:11434)</small>
      </div>
      <label class="switch">
        <input type="checkbox" id="model-mode-toggle">
        <span class="slider"></span>
      </label>
    </div>

    <div id="local-model-section" style="display:none;">

      <!-- Estado de Ollama -->
      <div class="model-switch-row" id="ollama-status-row">
        <div class="model-switch-label">
          Estado de Ollama
          <small id="ollama-status-text">Verificando...</small>
        </div>
        <span id="ollama-status-dot" class="status-dot orange"></span>
      </div>

      <!-- Modelos instalados -->
      <div class="model-switch-row">
        <div class="model-switch-label">
          Modelos Instalados
          <small id="installed-models-text">Ninguno</small>
        </div>
        <button id="refresh-models-btn" style="background:none;border:1px solid rgba(0,191,255,0.3);color:#00BFFF;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.6rem;">↻</button>
      </div>

      <!-- Selector de modelo activo (solo muestra instalados) -->
      <div class="model-switch-row">
        <div class="model-switch-label">
          Modelo Activo
          <small>Selecciona un modelo instalado para usar</small>
        </div>
        <select id="local-model-select" style="background:rgba(255,255,255,0.05);border:1px solid rgba(0,191,255,0.3);color:#fff;padding:4px 8px;border-radius:4px;font-size:0.7rem;max-width:180px;">
          <option value="">—</option>
        </select>
      </div>

      <!-- Descargar nuevo modelo -->
      <div class="model-switch-row" style="flex-wrap:wrap;gap:6px;">
        <div class="model-switch-label" style="flex:1;min-width:120px;">
          Descargar Modelo
          <small>Ejecuta: ollama pull &lt;modelo&gt;</small>
        </div>
        <div style="display:flex;gap:4px;flex:2;min-width:160px;">
          <input type="text" id="model-download-input" placeholder="ej: llama3.2:1b" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(0,191,255,0.3);color:#fff;padding:4px 8px;border-radius:4px;font-size:0.7rem;outline:none;">
          <button id="install-model-btn" style="background:rgba(0,191,255,0.15);border:1px solid #00BFFF;color:#00BFFF;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.65rem;white-space:nowrap;">Instalar</button>
        </div>
      </div>

      <!-- Progreso de descarga -->
      <div class="model-switch-row" id="download-progress-row" style="display:none;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;width:100%;">
          <small id="download-status" style="color:rgba(255,255,255,0.5);font-size:0.6rem;">Preparando...</small>
          <small id="download-pct" style="color:#00BFFF;font-size:0.6rem;">0%</small>
        </div>
        <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;width:100%;">
          <div id="download-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#00BFFF,#2ed573);border-radius:2px;transition:width 0.5s ease;"></div>
        </div>
      </div>

      <!-- Modelos recomendados -->
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);">
        <small style="color:rgba(255,255,255,0.35);font-size:0.55rem;">RECOMENDADOS (click para copiar):</small>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
          <span class="model-tag" data-model="llama3.2:1b">Llama 3.2 1B</span>
          <span class="model-tag" data-model="llama3.2:3b">Llama 3.2 3B</span>
          <span class="model-tag" data-model="mistral:7b">Mistral 7B</span>
          <span class="model-tag" data-model="phi3:3.8b">Phi-3 3.8B</span>
          <span class="model-tag" data-model="gemma2:2b">Gemma 2 2B</span>
          <span class="model-tag" data-model="qwen2.5:3b">Qwen 2.5 3B</span>
        </div>
      </div>

      <!-- Cómo obtener Ollama -->
      <div style="margin-top:8px;padding:6px 8px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.15);border-radius:4px;">
        <small style="color:#FFD700;font-size:0.6rem;">
          ⚡ ¿No tienes Ollama? Descárgalo gratis en 
          <a href="#" id="ollama-download-link" style="color:#00BFFF;text-decoration:underline;">ollama.com</a> 
          — es un instalador de 1 clic para Windows.
        </small>
      </div>
    </div>
  `;

  modalBody.insertAdjacentHTML('afterbegin', html);

  // ─── Eventos ──────────────────────────────────────────
  const toggle = document.getElementById('model-mode-toggle');
  const section = document.getElementById('local-model-section');
  const statusText = document.getElementById('ollama-status-text');
  const statusDot = document.getElementById('ollama-status-dot');
  const installedText = document.getElementById('installed-models-text');
  const modelSelect = document.getElementById('local-model-select');
  const refreshBtn = document.getElementById('refresh-models-btn');
  const downloadInput = document.getElementById('model-download-input');
  const installBtn = document.getElementById('install-model-btn');
  const downloadRow = document.getElementById('download-progress-row');
  const downloadBar = document.getElementById('download-bar');
  const downloadStatus = document.getElementById('download-status');
  const downloadPct = document.getElementById('download-pct');

  toggle?.addEventListener('change', async () => {
    section.style.display = toggle.checked ? 'block' : 'none';
    _mode = toggle.checked ? 'local' : 'cloud';
    _notifyModeChange();
    syncSidebarStatus();
    if (toggle.checked) await _scanLocalModels();
  });

  // ─── Escaneo real de modelos en disco ──────────────────────
  async function _scanLocalModels() {
    statusText.innerText = 'Escaneando almacenamiento...';
    statusDot.className = 'status-dot yellow';
    installedText.innerText = 'Escaneando...';
    _scanState = 'scanning';
    syncSidebarStatus();

    appendAuditLog('[AUDIT]: ESCANEANDO RUTAS LOCALES...');

    // Ejecutar el script Python de escaneo vía PowerShell
    // Ruta absoluta al script Python (__dirname no disponible en ES modules)
    const scriptPath = 'engine/scan_models.py';
    let resultJson = null;

    // Intentar con python, fallback a python3, luego py
    for (const py of ['python', 'python3', 'py']) {
      const cmd = `& { $base = Get-Location; $p = Join-Path $base "${scriptPath}"; if (!(Test-Path $p)) { $p = Join-Path $base "resources\\app\\${scriptPath}" }; if (Test-Path $p) { ${py} "$p" } else { ${py} ".\\${scriptPath}" } } 2>$null`;
      const res = await window.electronAPI.runPowerShell(cmd);
      if (res.success && res.output) {
        try {
          const parsed = JSON.parse(res.output);
          if (parsed && typeof parsed === 'object' && 'models' in parsed) {
            resultJson = parsed;
            break;
          }
        } catch {}
      }
    }

    if (!resultJson) {
      // Fallback: usar ollama list como fuente secundaria
      appendAuditLog('[AUDIT]: ⚠ Python no disponible, usando ollama list como alternativa');
      const data = await _ollamaFetch('/api/tags');
      if (data && data.models) {
        _installedModels = data.models.map(m => m.name);
        _scanCount = _installedModels.length;
        _scanState = _scanCount > 0 ? 'found' : 'empty';
        appendAuditLog(`[AUDIT]: ⚠ Verificación limitada — ${_scanCount} modelos reportados por API`);
      } else {
        _scanState = 'error';
        appendAuditLog('[AUDIT]: ✗ Ollama no responde. Sin modelos detectados.');
      }
    } else {
      // Parsear resultados reales del escaneo
      _scanCount = resultJson.count;
      if (resultJson.logs) {
        appendAuditLog(resultJson.logs);
      }

      if (resultJson.status === 'ok') {
        _scanState = 'found';
        _installedModels = resultJson.models.map(m => m.name);
        appendAuditLog(`[AUDIT]: Escaneo finalizado. ${_scanCount} modelos detectados.`);
      } else if (resultJson.status === 'empty') {
        _scanState = 'empty';
        _installedModels = [];
        appendAuditLog('[AUDIT]: Escaneo finalizado. Ningún modelo válido detectado en las rutas estándar.');
      } else {
        _scanState = 'error';
        _installedModels = [];
        appendAuditLog(`[AUDIT]: ✗ Error durante escaneo. Estado: ${resultJson.status}`);
      }

      // También consultar API de Ollama para tener nombres exactos
      const data = await _ollamaFetch('/api/tags');
      if (data && data.models) {
        _installedModels = data.models.map(m => m.name);
      }
    }

    // Actualizar UI
    _updateModelSelect();
    if (_scanState === 'found') {
      statusText.innerText = `✓ ${_scanCount} modelo(s) en disco`;
      statusDot.className = 'status-dot green';
      installedText.innerText = _installedModels.join(', ') || 'Listo';
    } else if (_scanState === 'empty') {
      statusText.innerText = 'Sin modelos locales';
      statusDot.className = 'status-dot red';
      installedText.innerText = 'Ninguno — descarga uno abajo';
    } else {
      statusText.innerText = 'Error de escaneo';
      statusDot.className = 'status-dot red';
      installedText.innerText = 'Error al escanear almacenamiento';
    }
    syncSidebarStatus();
  }

  function _updateModelSelect() {
    const currentVal = modelSelect.value;
    modelSelect.innerHTML = '<option value="">—</option>';
    _installedModels.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
    if (_installedModels.includes(currentVal)) modelSelect.value = currentVal;
  }

  refreshBtn?.addEventListener('click', _scanLocalModels);

  modelSelect?.addEventListener('change', () => {
    _localModel = modelSelect.value;
    if (_localModel) {
      showSystemMessage(`[SISTEMA] Modelo local activo: ${_localModel}`);
      localStorage.setItem('jarvis_local_model', _localModel);
    }
  });

  // Model tag click → fill input
  document.querySelectorAll('.model-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      downloadInput.value = tag.dataset.model;
    });
  });

  // Install model
  installBtn?.addEventListener('click', async () => {
    const model = downloadInput.value.trim();
    if (!model) return;
    await _downloadModel(model);
  });

  downloadInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') installBtn?.click();
  });

  // Download link
  document.getElementById('ollama-download-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.electronAPI.openBrowser('https://ollama.com');
  });

  // Restore saved state
  const savedMode = localStorage.getItem('jarvis_model_mode');
  const savedModel = localStorage.getItem('jarvis_local_model');
  if (savedMode === 'local' && toggle) {
    toggle.checked = true;
    section.style.display = 'block';
    _mode = 'local';
    _scanLocalModels();
    if (savedModel) {
      setTimeout(() => {
        modelSelect.value = savedModel;
        _localModel = savedModel;
      }, 500);
    }
    syncSidebarStatus();
  }
}

// ─── Download with real progress ────────────────────────────
async function _downloadModel(model) {
  const downloadRow = document.getElementById('download-progress-row');
  const downloadBar = document.getElementById('download-bar');
  const downloadStatus = document.getElementById('download-status');
  const downloadPct = document.getElementById('download-pct');
  if (!downloadRow || !downloadBar) return;

  // ─── Mutex: solo una descarga a la vez ────────────
  if (_isDownloading) {
    showSystemMessage('Sistema ocupado: Descarga en progreso. Por favor, espera a que el proceso actual finalice.');
    return;
  }
  _isDownloading = true;

  downloadRow.style.display = 'flex';
  downloadBar.style.width = '0%';
  downloadStatus.innerText = 'Verificando Ollama...';
  downloadPct.innerText = '0%';

  // 1. Check Ollama exists
  const check = await window.electronAPI.runPowerShell('ollama --version 2>&1');
  if (!check.success) {
    downloadStatus.innerText = '❌ Ollama no instalado. Descarga desde ollama.com';
    downloadBar.style.background = 'linear-gradient(90deg,#FF3B30,#FF6B6B)';
    _isDownloading = false; return;
  }

  // 2. Check if already installed
  const list = await window.electronAPI.runPowerShell('ollama list 2>&1');
  const modelName = model.split(':')[0].toLowerCase();
  if (list.success && list.output.toLowerCase().includes(modelName)) {
    downloadStatus.innerText = `✓ ${model} ya está instalado`;
    downloadBar.style.width = '100%';
    downloadPct.innerText = '100%';
    downloadBar.style.background = 'linear-gradient(90deg,#2ed573,#00BFFF)';
    setTimeout(() => { downloadRow.style.display = 'none'; }, 2000);
    _isDownloading = false; return;
  }

  // ─── Lanzar ollama pull como proceso detachado ────────────
  // Usamos cmd /c start /b para que corra en background sin bloquear
  const launchCmd = `cmd /c start /b ollama pull ${model}`;
  const launch = await window.electronAPI.runPowerShell(launchCmd);
  if (!launch.success) {
    downloadStatus.innerText = `❌ Error al iniciar descarga: ${launch.output}`;
    downloadBar.style.background = 'linear-gradient(90deg,#FF3B30,#FF6B6B)';
    downloadPct.innerText = 'ERROR';
    _isDownloading = false; return;
  }

  // ─── Poll honesto: sin porcentaje inventado ────────────────
  // La barra se pone en modo indeterminado (púlsa) hasta que
  // ollama list confirme que el modelo está instalado.
  downloadBar.className = 'download-bar-indeterminate';
  downloadBar.style.background = '';
  downloadPct.innerText = '⏳';
  downloadStatus.innerText = `Descargando ${model}...`;

  let attempts = 0;
  const maxAttempts = 600; // 20 min a 2s

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
    const elapsed = Math.round(attempts * 2);

    // Única fuente de verdad: ollama list
    const res = await window.electronAPI.runPowerShell('ollama list 2>&1');
    const found = res.success && res.output.toLowerCase().includes(modelName);

    if (found) {
      downloadBar.className = '';
      downloadBar.style.width = '100%';
      downloadPct.innerText = '✓';
      downloadStatus.innerText = `✓ ${model} instalado (${elapsed}s)`;
      _localModel = model;
      localStorage.setItem('jarvis_local_model', model);
      showSystemMessage(`[SISTEMA] Modelo ${model} descargado e instalado.`);
      await _refreshInstalledModels();
      const sel = document.getElementById('local-model-select');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = model; opt.textContent = model;
        sel.appendChild(opt);
        sel.value = model;
      }
      setTimeout(() => { downloadRow.style.display = 'none'; }, 2000);
      _isDownloading = false; return;
    }

    downloadStatus.innerText = `Descargando ${model}... (${elapsed}s)`;
  }

  // Timeout — 20 min sin respuesta
  downloadStatus.innerText = '⚠️ Tiempo agotado (20 min). Verifica conexión.';
  downloadBar.className = '';
  downloadBar.style.background = 'linear-gradient(90deg,#FFA500,#FF6B6B)';
  downloadPct.innerText = 'TIMEOUT';
  _isDownloading = false;
}

// ─── Notifications ──────────────────────────────────────────
function _notifyModeChange() {
  const msg = _mode === 'local'
    ? `[SISTEMA] Motor LOCAL activado. Ollama en localhost:11434. Modelo: ${_localModel || 'ninguno'}`
    : '[SISTEMA] Motor CLOUD activado. Conectado a Gemini.';
  showSystemMessage(msg);
}

function showSystemMessage(text) {
  console.log(`[MODEL] ${text}`);
}

// ─── Sidebar sync ───────────────────────────────────────────
export function syncSidebarStatus() {
  const modeEl = document.getElementById('diag-mode-sidebar');
  if (!modeEl) return;
  if (_mode === 'local') {
    const modelLabel = _localModel ? ` ${_localModel}` : '';
    let dotClass = 'green';
    let label = `LOCAL${modelLabel}`;
    if (_scanState === 'scanning') {
      dotClass = 'yellow';
      label = 'LOCAL (ESCANEANDO...)';
    } else if (_scanState === 'empty') {
      dotClass = 'red';
      label = 'LOCAL (SIN MODELOS)';
    } else if (_scanState === 'error') {
      dotClass = 'red';
      label = 'LOCAL (ERROR)';
    }
    modeEl.innerHTML = `<span class="status-dot ${dotClass}"></span> ${label}`;
  } else {
    modeEl.innerHTML = `<span class="status-dot green"></span> CLOUD`;
  }
}
