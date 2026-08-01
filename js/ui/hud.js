import { store } from '../state/store.js';

/**
 * HUD — Actualiza los indicadores de diagnóstico del panel inferior
 * (estado WS, latencia, micrófono, modo de red).
 */

export function updateDiagnostics(key, value) {
  if (key === 'WS') {
    _updateWsStatus(value);
  } else if (key === 'Latencia') {
    _updateEl('diag-latency', value);
    _updateEl('diag-latency-sidebar', value);
  } else if (key === 'Micrófono') {
    const el = document.getElementById('diag-mic-status');
    if (el) el.innerText = value === 'ACTIVO' ? 'ACTIVO 🔴' : 'INACTIVO ⚫';
  } else if (key === 'Modo') {
    _updateNetMode(value);
  }
}

function _updateWsStatus(value) {
  const dotColor = value === 'CONECTADO' ? 'green' : value === 'CONECTANDO...' ? 'orange' : 'red';
  for (const id of ['diag-ws-status', 'diag-ws-status-sidebar']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = '';
    const dot = document.createElement('span');
    dot.className = 'status-dot ' + dotColor;
    el.appendChild(dot);
    el.appendChild(document.createTextNode(' ' + value));
  }
}

function _updateNetMode(mode) {
  const el = document.getElementById('diag-net-mode');
  if (el) el.innerText = mode === 'cloud' ? '☁ CLOUD' : '💻 LOCAL';
}

function _updateEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

export function updateUiState(next) {
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    micBtn.classList.remove('speaking', 'listening', 'working', 'idle');
    micBtn.classList.add(next);
  }
}

/** Muestra el progreso de una operación en la barra inferior del HUD */
export function showHudProgress(label, step = 0, total = 0) {
  const el = document.getElementById('hud-progress-label');
  if (el) el.innerText = step && total ? `${label} (${step}/${total})` : label;
}

export function clearHudProgress() {
  const el = document.getElementById('hud-progress-label');
  if (el) el.innerText = '';
}
