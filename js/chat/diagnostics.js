import { store } from '../state/store.js';

export function updateDiagnostics(key, value) {
  if (key === 'WS') {
    const el = document.getElementById('diag-ws-status');
    if (el) {
      let dotColor = 'red';
      if (value === 'CONECTADO') dotColor = 'green';
      else if (value === 'CONECTANDO...') dotColor = 'orange';
      el.textContent = '';
      const dot = document.createElement('span');
      dot.className = 'status-dot ' + dotColor;
      el.appendChild(dot);
      el.appendChild(document.createTextNode(' ' + value));
    }
    const sidebarEl = document.getElementById('diag-ws-status-sidebar');
    if (sidebarEl) {
      let dotColor = 'red';
      if (value === 'CONECTADO') dotColor = 'green';
      else if (value === 'CONECTANDO...') dotColor = 'orange';
      sidebarEl.textContent = '';
      const dot = document.createElement('span');
      dot.className = 'status-dot ' + dotColor;
      sidebarEl.appendChild(dot);
      sidebarEl.appendChild(document.createTextNode(' ' + value));
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

// ─── Monitoreo de procesos en tiempo real ──────────────────
let _procMonitorInterval = null;

export function startProcessMonitor() {
  if (_procMonitorInterval) return;
  _procMonitorInterval = setInterval(async () => {
    const body = document.getElementById('thinking-body');
    if (!body || body.classList.contains('collapsed')) return;

    // Solo escribir si el panel aún tiene el placeholder (sin razonamiento real)
    if (body.querySelector('.thinking-placeholder') === null) return;

    try {
      const ps = await window.electronAPI.runPowerShell(
        'Get-Process | Where-Object { $_.ProcessName -match "ollama|powershell|node|electron|python" } | Select-Object Id, ProcessName, @{N="CPU";E={[math]::Round($_.CPU,1)}} | ConvertTo-Json -Compress'
      );
      if (!ps.success || !ps.output) return;

      let processes;
      try { processes = JSON.parse(ps.output); } catch { processes = []; }
      if (!Array.isArray(processes)) processes = [processes];

      const lines = processes.map(p =>
        `PID:${p.Id} ${p.ProcessName} CPU:${p.CPU || 0}%`
      ).join('\n');

      const audioStatus = store.get('micActive') ? '🎤 Activo' : '🎤 Inactivo';
      const wsStatus = document.getElementById('diag-ws-status')?.innerText || '?';
      const mode = document.getElementById('diag-mode-sidebar')?.innerText || 'CLOUD';

      body.textContent = '';
      const container = document.createElement('div');
      container.style.cssText = 'font-size:0.6rem;line-height:1.6;';
      container.textContent =
        `[ESTADO]\n${audioStatus} · WS ${wsStatus.replace(/<[^>]+>/g,'')} · ${mode}\n\n` +
        `[PROCESOS CRÍTICOS]\n${lines || '(ninguno)'}\n\n`;
      const timeSpan = document.createElement('span');
      timeSpan.style.color = 'rgba(255,255,255,0.25)';
      timeSpan.textContent = 'Actualizado: ' + new Date().toLocaleTimeString();
      container.appendChild(timeSpan);
      body.appendChild(container);
    } catch {}
  }, 3000);
}

export function stopProcessMonitor() {
  if (_procMonitorInterval) {
    clearInterval(_procMonitorInterval);
    _procMonitorInterval = null;
  }
}

// ─── Auditoría — Log de escaneo de modelos ────────────────
export function appendAuditLog(lines) {
  const body = document.getElementById('thinking-body');
  if (!body) return;
  const existing = body.querySelector('.audit-section');
  let section;
  if (existing) {
    section = existing;
  } else {
    section = document.createElement('div');
    section.className = 'audit-section';
    section.style.cssText = 'font-size:0.6rem;line-height:1.5;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06);';
    const title = document.createElement('div');
    title.style.cssText = 'color:rgba(255,215,0,0.6);font-family:Orbitron;font-size:0.55rem;margin-bottom:3px;';
    title.textContent = '═══ AUDITORÍA ═══';
    section.appendChild(title);
    body.prepend(section);
  }
  const linesArr = Array.isArray(lines) ? lines : [lines];
  linesArr.forEach(line => {
    const el = document.createElement('div');
    el.style.cssText = 'color:rgba(255,255,255,0.5);';
    // Color-code log levels
    if (line.includes('✗') || line.includes('Error') || line.includes('corrupto') || line.includes('inválido')) {
      el.style.color = '#FF6B6B';
    } else if (line.includes('✓') || line.includes('validado') || line.includes('exitosa')) {
      el.style.color = '#2ed573';
    } else if (line.includes('ESCANEANDO')) {
      el.style.color = '#ffa502';
    }
    el.textContent = line;
    section.appendChild(el);
  });
}

export function updateUiState(next) {
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    micBtn.classList.remove('speaking', 'listening', 'working', 'idle');
    micBtn.classList.add(next);
  }

  // Reactor state classes drive the animated ring/core colors via CSS
  // El reactor principal mantiene su propia animación y no se altera por el estado.
  // Solo la burbuja / HUD inferior se actualiza para mostrar acciones y progreso.
}

