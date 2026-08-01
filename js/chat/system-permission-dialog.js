import { createLogger } from '../utils/logger.js';
const _log = createLogger('SYS_PERM');

let _activeResolve = null;
let _dialogEl = null;
let _keyframesAdded = false;

function _ensureKeyframes() {
  if (_keyframesAdded) return;
  _keyframesAdded = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes sysPermFadeIn {
      from { opacity: 0; backdrop-filter: blur(0px); }
      to { opacity: 1; backdrop-filter: blur(12px) saturate(200%); }
    }
    @keyframes sysPermScaleIn {
      from { transform: scale(0.92) translateY(20px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }
    @keyframes sysPermShieldPulse {
      0%, 100% { filter: drop-shadow(0 0 6px rgba(138, 43, 226, 0.3)); }
      50% { filter: drop-shadow(0 0 20px rgba(138, 43, 226, 0.9)); }
    }
    @keyframes sysPermProgress {
      from { width: 0%; }
      to { width: 100%; }
    }
    .sys-perm-btn {
      padding: 10px 20px;
      border: 1px solid rgba(138, 43, 226, 0.15);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Outfit', 'Segoe UI', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .sys-perm-btn.deny {
      background: rgba(235, 94, 85, 0.08);
      border-color: rgba(235, 94, 85, 0.25);
      color: #ff7675;
    }
    .sys-perm-btn.deny:hover {
      background: rgba(235, 94, 85, 0.2);
      border-color: #ff7675;
      box-shadow: 0 0 12px rgba(235, 94, 85, 0.25);
      transform: translateY(-1px);
    }
    .sys-perm-btn.once {
      background: rgba(0, 191, 255, 0.05);
      border-color: rgba(0, 191, 255, 0.25);
      color: #00bfff;
    }
    .sys-perm-btn.once:hover {
      background: rgba(0, 191, 255, 0.12);
      border-color: #00bfff;
      box-shadow: 0 0 12px rgba(0, 191, 255, 0.25);
      transform: translateY(-1px);
    }
    .sys-perm-btn.all {
      background: linear-gradient(135deg, rgba(138, 43, 226, 0.85), rgba(0, 191, 255, 0.85));
      border-color: #8a2be2;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .sys-perm-btn.all:hover {
      background: linear-gradient(135deg, #8a2be2, #00bfff);
      box-shadow: 0 0 24px rgba(138, 43, 226, 0.5);
      transform: translateY(-1.5px);
    }
    .sys-perm-info {
      background: rgba(0, 191, 255, 0.06);
      border: 1px solid rgba(0, 191, 255, 0.15);
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 18px;
      font-size: 12.5px;
      line-height: 1.6;
      color: #b0d4e8;
    }
    .sys-perm-info strong {
      color: #e8f4ff;
    }
  `;
  document.head.appendChild(style);
}

function _buildDialog(command, description) {
  const existing = document.getElementById('sys-perm-dialog');
  if (existing) existing.remove();
  _ensureKeyframes();

  const overlay = document.createElement('div');
  overlay.id = 'sys-perm-dialog';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 10000; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(12px) saturate(200%);
    -webkit-backdrop-filter: blur(12px) saturate(200%);
    animation: sysPermFadeIn 0.3s ease-out;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: rgba(10, 15, 30, 0.92);
    border: 1px solid rgba(138, 43, 226, 0.25);
    border-radius: 20px;
    padding: 32px 36px;
    max-width: 540px;
    width: 90%;
    box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(138, 43, 226, 0.15), inset 0 0 30px rgba(138, 43, 226, 0.03);
    font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
    color: #e8f4ff;
    animation: sysPermScaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px;';

  const icon = document.createElement('div');
  icon.textContent = '🛡️';
  icon.style.cssText = `
    font-size: 28px;
    display: flex; align-items: center; justify-content: center;
    width: 52px; height: 52px;
    background: rgba(138, 43, 226, 0.12);
    border: 1px solid rgba(138, 43, 226, 0.3);
    border-radius: 14px;
    flex-shrink: 0;
    animation: sysPermShieldPulse 2.5s infinite ease-in-out;
  `;

  const titleWrapper = document.createElement('div');
  titleWrapper.style.cssText = 'flex: 1;';

  const title = document.createElement('div');
  title.textContent = 'SEGURIDAD DEL SISTEMA';
  title.style.cssText = 'font-size: 10px; font-family: "Space Mono", monospace; color: #8a2be2; letter-spacing: 2.5px; font-weight: 700; margin-bottom: 3px;';

  const subTitle = document.createElement('div');
  subTitle.textContent = 'Solicitud de autorización';
  subTitle.style.cssText = 'font-size: 18px; font-weight: 700; color: #fff; line-height: 1.3;';

  const riskBadge = document.createElement('div');
  riskBadge.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 8px;
    background: rgba(255, 107, 53, 0.12);
    border: 1px solid rgba(255, 107, 53, 0.3);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 10px;
    font-weight: 600;
    color: #ffb86c;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  `;
  riskBadge.innerHTML = '⚠️ Nivel de riesgo: Moderado';

  titleWrapper.appendChild(title);
  titleWrapper.appendChild(subTitle);
  titleWrapper.appendChild(riskBadge);
  header.appendChild(icon);
  header.appendChild(titleWrapper);

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size: 13.5px; line-height: 1.7; color: #b0c8d8; margin-bottom: 16px;';
  desc.innerHTML = 'Jarvis necesita ejecutar un comando en la terminal de Windows para completar la acción solicitada. <strong style="color:#e8f4ff;">Revise los detalles antes de decidir.</strong>';

  const taskLabel = description || 'Operación del sistema';
  const pathDisplay = document.createElement('div');
  pathDisplay.style.cssText = `
    background: rgba(2, 5, 9, 0.6);
    border: 1px solid rgba(138, 43, 226, 0.2);
    border-radius: 10px;
    padding: 14px 18px;
    font-size: 12px;
    font-family: 'Space Mono', 'Consolas', monospace;
    margin-bottom: 16px;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
  `;
  pathDisplay.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <span style="color: rgba(138, 43, 226, 0.7); font-weight: bold; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;">Acción solicitada</span>
      <span style="color: #7ecfff; font-size: 11px;">${taskLabel.toUpperCase()}</span>
    </div>
    <div style="color: #fff; word-break: break-all; font-size: 11.5px; opacity: 0.9;">${command.substring(0, 300)}${command.length > 300 ? '...' : ''}</div>
  `;

  const infoBox = document.createElement('div');
  infoBox.className = 'sys-perm-info';
  infoBox.innerHTML = `
    <strong>🔍 ¿Qué significa cada opción?</strong><br>
    • <strong>Denegar</strong> — La acción no se ejecutará. Jarvis buscará otra forma de ayudarle.<br>
    • <strong>Permitir una vez</strong> — Se ejecuta esta vez. Jarvis volverá a preguntar en el futuro.<br>
    • <strong>Permitir todo</strong> — Jarvis recordará su decisión y no volverá a preguntar. Solo recomendado si confía plenamente en Jarvis.
  `;

  const warning = document.createElement('div');
  warning.style.cssText = `
    font-size: 11.5px;
    color: #ffb86c;
    margin-bottom: 22px;
    display: flex; gap: 10px; align-items: flex-start;
    line-height: 1.55;
    background: rgba(255, 184, 108, 0.06);
    border: 1px solid rgba(255, 184, 108, 0.15);
    border-radius: 10px;
    padding: 12px 16px;
  `;
  warning.innerHTML = '⚠️ <span style="opacity: 0.9;">Al seleccionar <strong>"Permitir todo"</strong>, Jarvis podrá ejecutar comandos en el futuro sin solicitar su confirmación. Asegúrese de confiar plenamente antes de elegir esta opción.</span>';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px;';

  function _makeBtn(text, cls, value) {
    const btn = document.createElement('button');
    btn.className = `sys-perm-btn ${cls}`;
    btn.textContent = text;
    btn.onclick = () => {
      if (_activeResolve) _activeResolve(value);
      _activeResolve = null;
      overlay.remove();
      _dialogEl = null;
    };
    return btn;
  }

  const denyBtn = _makeBtn('Denegar', 'deny', 'deny');
  const onceBtn = _makeBtn('Permitir una vez', 'once', 'once');
  const allBtn = _makeBtn('Permitir todo', 'all', 'all');

  btnRow.appendChild(denyBtn);
  btnRow.appendChild(onceBtn);
  btnRow.appendChild(allBtn);

  card.appendChild(header);
  card.appendChild(desc);
  card.appendChild(pathDisplay);
  card.appendChild(infoBox);
  card.appendChild(warning);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  _dialogEl = overlay;

  return overlay;
}

export function requestSystemPermission(command, description) {
  return new Promise((resolve) => {
    if (_activeResolve) {
      _activeResolve('deny');
      _activeResolve = null;
    }
    _activeResolve = resolve;
    _buildDialog(command, description);
  });
}

export function cancelPendingSystemPermission() {
  if (_activeResolve) {
    _activeResolve('deny');
    _activeResolve = null;
  }
  if (_dialogEl) {
    _dialogEl.remove();
    _dialogEl = null;
  }
}
