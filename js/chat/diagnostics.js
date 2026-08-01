import { store } from '../state/store.js';

export function updateDiagnostics(key, value) {
  if (key === 'WS') {
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
  } else if (key === 'Latencia') {
    const latencyEl = document.getElementById('diag-latency');
    if (latencyEl) latencyEl.innerText = value;
    const sidebarLat = document.getElementById('diag-latency-sidebar');
    if (sidebarLat) sidebarLat.innerText = value;
  } else if (key === 'Micrófono') {
    const el = document.getElementById('diag-mic-status');
    if (el) el.innerText = value === 'ACTIVO' ? 'ACTIVO 🔴' : 'INACTIVO ⚫';
  }
}

export function updateUiState(next) {
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    micBtn.classList.remove('speaking', 'listening', 'working', 'idle');
    micBtn.classList.add(next);
  }
}

export function appendAuditLog(msg) {
  console.log(`[AUDIT] ${msg}`);
}
