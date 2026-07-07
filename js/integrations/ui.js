import { getAllIntegrations, getIntegrationStatus, getIntegrationConfig, configureIntegration, disconnectIntegration } from './index.js';
import { closeModal } from '../config/index.js';

import { createLogger } from '../utils/logger.js';
const _log = createLogger('INT-UI');

function _statusInfo(status) {
  if (status === 'connected') return { cls: 'green', label: 'Conectado', icon: '✓' };
  if (status === 'error') return { cls: 'red', label: 'Error', icon: '⚠' };
  return { cls: 'gray', label: 'Desconectado', icon: '○' };
}

function _relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function _toolCount(int) {
  return (int.getFunctionDeclarations?.() || []).length;
}

export function renderIntegrationsModal() {
  const modal = document.getElementById('integrations-modal');
  if (!modal) return;
  const integrations = getAllIntegrations();

  let html;
  if (!integrations || integrations.length === 0) {
    html = `<div class="int-empty"><div class="int-empty-text">No hay integraciones disponibles</div></div>`;
  } else {
    html = `<div class="int-list">`;
    integrations.forEach(int => {
      const s = _statusInfo(getIntegrationStatus(int.id));
      const cfg = getIntegrationConfig(int.id);
      const lastUsed = cfg._lastTest ? _relativeTime(cfg._lastTest) : '';
      const tools = _toolCount(int);
      html += `<div class="int-card" data-id="${int.id}">
        <div class="int-card-icon ${s.cls}">${int.icon}</div>
        <div class="int-card-info">
          <div class="int-card-name">${int.name}</div>
          <div class="int-card-desc">${int.description}</div>
          <div class="int-card-meta">
            <span class="int-meta-${s.cls}">${s.icon} ${s.label}</span>
            ${lastUsed ? `<span class="int-meta-time">${lastUsed}</span>` : ''}
            ${tools > 0 ? `<span class="int-meta-tools">${tools} cmd</span>` : ''}
          </div>
        </div>
        <button class="int-btn cfg-btn" data-id="${int.id}">${s.cls === 'green' ? 'Administrar' : 'Conectar'}</button>
      </div>`;
    });
    html += `</div>`;
  }

  const body = modal.querySelector('.int-modal-body');
  if (body) body.innerHTML = html;
  modal.querySelectorAll('.cfg-btn').forEach(b => b.addEventListener('click', () => _showConfigForm(b.dataset.id)));
}

function _showConfigForm(id) {
  const body = document.querySelector('.int-modal-body');
  const int = getAllIntegrations().find(i => i.id === id);
  if (!int || !body) return;

  const config = getIntegrationConfig(id);
  const s = _statusInfo(getIntegrationStatus(id));
  const tools = int.getFunctionDeclarations?.() || [];

  let fieldsHtml = '';
  int.configFields.forEach(f => {
    const val = config[f.key] || '';
    fieldsHtml += `<div class="int-cfg-field">
      <label for="int-${id}-${f.key}">${f.label}</label>
      <input type="${f.type}" id="int-${id}-${f.key}" class="int-cfg-input" placeholder="${f.placeholder || ''}" value="${val}" ${f.type === 'password' && val ? 'disabled' : ''}>
    </div>`;
  });

  let toolsHtml = '';
  if (tools.length > 0) {
    toolsHtml = `<details class="int-td" open><summary class="int-ts">Comandos (${tools.length})</summary><div class="int-tl">`;
    tools.forEach(t => {
      toolsHtml += `<div class="int-ti"><code>${t.name}</code><span>${t.description.length > 100 ? t.description.slice(0, 100) + '...' : t.description}</span></div>`;
    });
    toolsHtml += `</div></details>`;
  }

  body.innerHTML = `<div class="int-cfg-header">
      <button class="int-btn int-back-btn" id="int-back-btn">← Volver</button>
      <div class="int-cfg-title">${int.icon} ${int.name}</div>
    </div>
    <div class="int-cfg-desc">${int.description}</div>
    <div class="int-cfg-banner ${s.cls}">${s.icon} ${s.label}</div>
    <div class="int-cfg-fields">${fieldsHtml}</div>
    <div id="int-result-${id}" class="int-result"></div>
    <div class="int-cfg-actions">
      <button class="int-btn primary" id="int-test-btn" data-id="${id}">Probar</button>
      
      ${s.cls === 'green' ? `<button class="int-btn danger" id="int-disc-btn" data-id="${id}">Desconectar</button>` : ''}
      <button class="int-btn guide-btn" id="int-guide-btn" data-id="${id}">Guíame Jarvis</button>
    </div>
    ${toolsHtml}`;

  body.querySelector('.int-back-btn')?.addEventListener('click', renderIntegrationsModal);

  body.querySelector('#int-test-btn')?.addEventListener('click', async () => {
    const rd = body.querySelector('.int-result');
    rd.textContent = 'Probando...';
    rd.className = 'int-result';
    const d = {};
    int.configFields.forEach(f => {
      const el = body.querySelector(`#int-${id}-${f.key}`);
      if (el) d[f.key] = f.type === 'password' && el.disabled ? (config[f.key] || '') : el.value.trim();
    });
    const r = await configureIntegration(id, d);
    rd.textContent = r.success ? '✓ Conectado' : `✗ ${r.error}`;
    rd.className = r.success ? 'int-result ok' : 'int-result fail';
    if (r.success) setTimeout(() => _showConfigForm(id), 1500);
  });

  body.querySelector('#int-disc-btn')?.addEventListener('click', () => { disconnectIntegration(id); _showConfigForm(id); });

  body.querySelector('.guide-btn')?.addEventListener('click', () => {
    const steps = int.guideSteps || [
      `1. Obtén tus credenciales en ${int.authUrl || 'la página oficial del servicio'}.`,
      `2. Crea una aplicación nueva y configura los redirect URIs.`,
      `3. Copia el Client ID y Client Secret en los campos de arriba.`,
      `4. Haz clic en "Autorizar" para iniciar sesión con tu cuenta.`,
      `5. ¡Listo! Jarvis ahora puede usar ${int.name}.`
    ];
    body.innerHTML = `<div class="int-cfg-header">
      <button class="int-btn int-back-btn" id="int-back-guide">← Volver</button>
      <div class="int-cfg-title">${int.icon} Guía: ${int.name}</div>
    </div>
    <div class="int-guide-steps">${steps.map(s => `<div class="int-guide-step"><span class="int-gs-num">${s.match(/^(\d+)/)?.[1] || '○'}</span><span class="int-gs-text">${s.replace(/^\d+\.\s*/, '')}</span></div>`).join('')}</div>
    ${int.authUrl ? `<div class="int-guide-link"><a href="${int.authUrl}" target="_blank" class="int-btn">Ir al sitio de ${int.name}</a></div>` : ''}
    <div class="int-guide-end">¿Listo? <button class="int-btn primary" id="int-back-guide-ready">Volver a configuración</button></div>`;
    body.querySelector('#int-back-guide')?.addEventListener('click', () => _showConfigForm(id));
    body.querySelector('#int-back-guide-ready')?.addEventListener('click', () => _showConfigForm(id));
  });
}

export function initIntegrationsUI() {
  const btn = document.getElementById('integrations-btn');
  const modal = document.getElementById('integrations-modal');
  if (!btn || !modal) return;

  btn.addEventListener('click', () => { modal.classList.add('active'); renderIntegrationsModal(); });
  document.getElementById('int-modal-close-btn')?.addEventListener('click', () => closeModal(modal));
  document.getElementById('int-modal-close')?.addEventListener('click', () => closeModal(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
}
