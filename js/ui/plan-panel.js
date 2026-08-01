import { store } from '../state/store.js';
import { bus } from '../utils/event-bus.js';
import { listPlans, getPlan, deletePlan, updatePlan, flushPlans } from '../memory/plans.js';
import { _resetTurnState } from '../chat/messages.js';
import { connectWebSocket } from '../Core/Connection/manager.js';
import { resetGreetingFlag } from '../Core/Connection/handler.js';

let _panel, _body, _toggleBtn, _closeBtn;

function _render() {
  if (!_body) return;
  const plans = listPlans();
  if (plans.length === 0) {
    _body.innerHTML = '<div class="pp-empty">No hay planes guardados.<br>Pedile a Jarvis que cree un plan.</div>';
    return;
  }
  _body.innerHTML = plans.map(p => {
    const done = p.steps.filter(s => s.status === 'done').length;
    const total = p.steps.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const statusClass = p.status === 'active' ? 'pp-card-active' : p.status === 'completed' ? 'pp-card-done' : 'pp-card-failed';
    const date = new Date(p.createdAt).toLocaleDateString('es-ES');
    return `<div class="pp-card ${statusClass}" data-id="${p.id}">
      <div class="pp-card-header">
        <span class="pp-card-title">${p.title}</span>
        <span class="pp-card-status">${p.status}</span>
      </div>
      <div class="pp-card-meta">${date} · ${done}/${total} pasos</div>
      <div class="pp-card-bar"><div class="pp-card-fill" style="width:${pct}%"></div></div>
      <div class="pp-card-actions">
        <button class="pp-btn pp-btn-view" data-id="${p.id}">Ver</button>
        <button class="pp-btn pp-btn-start" data-id="${p.id}" ${p.status !== 'active' ? 'disabled' : ''}>Ejecutar</button>
        <button class="pp-btn pp-btn-del" data-id="${p.id}">Eliminar</button>
      </div>
    </div>`;
  }).join('');

  _body.querySelectorAll('.pp-btn-view').forEach(btn => {
    btn.addEventListener('click', () => _showPlan(btn.dataset.id));
  });
  _body.querySelectorAll('.pp-btn-start').forEach(btn => {
    btn.addEventListener('click', () => _startPlan(btn.dataset.id));
  });
  _body.querySelectorAll('.pp-btn-del').forEach(btn => {
    btn.addEventListener('click', () => _deletePlan(btn.dataset.id));
  });
}

function _showPlan(id) {
  const plan = getPlan(id);
  if (!plan) return;
  const done = plan.steps.filter(s => s.status === 'done').length;
  const total = plan.steps.length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const stepsHtml = plan.steps.map(s => {
    const icon = s.status === 'done' ? '✅' : s.status === 'failed' ? '❌' : s.status === 'in_progress' ? '⏳' : '⬜';
    return `<div class="pp-step"><span class="pp-step-icon">${icon}</span><span class="pp-step-desc">${s.desc}</span></div>`;
  }).join('');
  _body.innerHTML = `<div class="pp-detail">
    <div class="pp-detail-header">
      <button class="pp-btn pp-btn-back">← Volver</button>
      <span class="pp-detail-title">${plan.title}</span>
    </div>
    <div class="pp-detail-goal">${plan.goal}</div>
    <div class="pp-detail-steps">${stepsHtml}</div>
    <div class="pp-detail-footer">
      <div class="pp-card-bar"><div class="pp-card-fill" style="width:${pct}%"></div></div>
      <div class="pp-detail-progress-text">${done}/${total} pasos completados</div>
      <div class="pp-detail-actions">
        <button class="pp-btn pp-btn-back">← Volver</button>
        <button class="pp-btn pp-btn-start-detail" data-id="${plan.id}" ${plan.status !== 'active' ? 'disabled' : ''}>▶ Ejecutar</button>
        <button class="pp-btn pp-btn-exit" data-id="${plan.id}">✕ Salir del modo plan</button>
      </div>
    </div>
  </div>`;
  _body.querySelector('.pp-btn-back').addEventListener('click', _render);
  _body.querySelector('.pp-btn-start-detail')?.addEventListener('click', () => _startPlan(plan.id));
  _body.querySelector('.pp-btn-exit')?.addEventListener('click', () => _exitPlanMode(plan.id));
}

function _exitPlanMode(id) {
  const plan = getPlan(id);
  if (!plan) return;
  store.set('_activePlanMode', null);
  _panel?.classList.add('collapsed');
}

async function _startPlan(id) {
  const plan = getPlan(id);
  if (!plan) return;
  if (!confirm(`¿Iniciar ejecución del plan "${plan.title}"?\nSe reiniciará la conversación actual.`)) return;
  store.set('_activePlanMode', plan.id);
  _panel?.classList.add('collapsed');
  await _resetTurnState();
  store.set('messageCount', 0);
  store.set('conversationHistory', []);
  resetGreetingFlag();
  const ws = window.ws;
  if (ws && (ws.readyState === 1 || ws.readyState === 0)) {
    store.set('isReconnectingIntentional', true);
    ws.close();
  } else {
    connectWebSocket();
  }
}

async function _deletePlan(id) {
  if (!confirm('¿Eliminar este plan?')) return;
  deletePlan(id);
  _render();
}

export function initPlanPanel() {
  _panel = document.getElementById('plan-panel');
  _body = document.getElementById('pp-body');
  _toggleBtn = document.getElementById('plan-toggle-btn');
  _closeBtn = document.getElementById('plan-close-btn');

  _toggleBtn?.addEventListener('click', () => {
    _panel?.classList.toggle('collapsed');
    if (!_panel?.classList.contains('collapsed')) _render();
  });
  _closeBtn?.addEventListener('click', () => _panel?.classList.add('collapsed'));

  bus.on('plan:updated', _render);
  store.on('change:userMemory', _render);

  // Flush pending writes on close
  window.addEventListener('beforeunload', () => flushPlans());
}

export function refreshPlanPanel() {
  _panel = document.getElementById('plan-panel') || _panel;
  _body = document.getElementById('pp-body') || _body;
  _render();
}
