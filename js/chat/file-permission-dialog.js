import { createLogger } from '../utils/logger.js';
const _log = createLogger('PERM');

let _activeResolve = null;
let _dialogEl = null;
let _keyframesAdded = false;

function _ensureKeyframes() {
  if (_keyframesAdded) return;
  _keyframesAdded = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes permFadeIn {
      from { opacity: 0; backdrop-filter: blur(0px); }
      to { opacity: 1; backdrop-filter: blur(12px) saturate(200%); }
    }
    @keyframes permScaleIn {
      from { transform: scale(0.92) translateY(20px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }
    @keyframes permLockPulse {
      0%, 100% { filter: drop-shadow(0 0 6px rgba(0, 191, 255, 0.3)); }
      50% { filter: drop-shadow(0 0 20px rgba(0, 191, 255, 0.9)); }
    }
    .perm-btn {
      padding: 10px 20px;
      border: 1px solid rgba(0, 191, 255, 0.15);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Outfit', 'Segoe UI', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .perm-btn.deny {
      background: rgba(235, 94, 85, 0.08);
      border-color: rgba(235, 94, 85, 0.25);
      color: #ff7675;
    }
    .perm-btn.deny:hover {
      background: rgba(235, 94, 85, 0.2);
      border-color: #ff7675;
      box-shadow: 0 0 12px rgba(235, 94, 85, 0.25);
      transform: translateY(-1px);
    }
    .perm-btn.once {
      background: rgba(0, 191, 255, 0.05);
      border-color: rgba(0, 191, 255, 0.25);
      color: #00bfff;
    }
    .perm-btn.once:hover {
      background: rgba(0, 191, 255, 0.12);
      border-color: #00bfff;
      box-shadow: 0 0 12px rgba(0, 191, 255, 0.25);
      transform: translateY(-1px);
    }
    .perm-btn.all {
      background: linear-gradient(135deg, rgba(0, 191, 255, 0.85), rgba(0, 102, 255, 0.85));
      border-color: #00bfff;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .perm-btn.all:hover {
      background: linear-gradient(135deg, #00bfff, #0066ff);
      box-shadow: 0 0 24px rgba(0, 191, 255, 0.5);
      transform: translateY(-1.5px);
    }
    .perm-info {
      background: rgba(0, 191, 255, 0.06);
      border: 1px solid rgba(0, 191, 255, 0.15);
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 18px;
      font-size: 12.5px;
      line-height: 1.6;
      color: #b0d4e8;
    }
    .perm-info strong {
      color: #e8f4ff;
    }
  `;
  document.head.appendChild(style);
}

function _getOperationLabel(op) {
  const labels = {
    list: 'Listar contenido de',
    read: 'Leer archivo',
    write: 'Escribir archivo en',
    delete: 'Eliminar',
    info: 'Obtener información de',
    move: 'Mover',
    copy: 'Copiar',
    find: 'Buscar archivos en'
  };
  return labels[op] || 'Acceder a';
}

function _getOpIcon(op) {
  const icons = {
    list: '📂',
    read: '📖',
    write: '✏️',
    delete: '🗑️',
    info: 'ℹ️',
    move: '📦',
    copy: '📋',
    find: '🔍'
  };
  return icons[op] || '📁';
}

function _getOpRisk(op) {
  const high = ['delete', 'write', 'move'];
  return high.includes(op) ? 'Alto' : 'Bajo';
}

function _getOpRiskColor(op) {
  const high = ['delete', 'write', 'move'];
  return high.includes(op) ? '#ff6b6b' : '#2ed573';
}

function _buildDialog(path, op) {
  const existing = document.getElementById('file-perm-dialog');
  if (existing) existing.remove();
  _ensureKeyframes();

  const overlay = document.createElement('div');
  overlay.id = 'file-perm-dialog';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 10000; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(12px) saturate(200%);
    -webkit-backdrop-filter: blur(12px) saturate(200%);
    animation: permFadeIn 0.3s ease-out;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: rgba(10, 25, 47, 0.92);
    border: 1px solid rgba(0, 191, 255, 0.2);
    border-radius: 20px;
    padding: 32px 36px;
    max-width: 540px;
    width: 90%;
    box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(0, 191, 255, 0.12), inset 0 0 30px rgba(0, 191, 255, 0.03);
    font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
    color: #e8f4ff;
    animation: permScaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px;';

  const icon = document.createElement('div');
  icon.textContent = _getOpIcon(op);
  icon.style.cssText = `
    font-size: 28px;
    display: flex; align-items: center; justify-content: center;
    width: 52px; height: 52px;
    background: rgba(0, 191, 255, 0.12);
    border: 1px solid rgba(0, 191, 255, 0.3);
    border-radius: 14px;
    flex-shrink: 0;
    animation: permLockPulse 2.5s infinite ease-in-out;
  `;

  const titleWrapper = document.createElement('div');
  titleWrapper.style.cssText = 'flex: 1;';

  const title = document.createElement('div');
  title.textContent = 'ACCESO A ARCHIVOS';
  title.style.cssText = 'font-size: 10px; font-family: "Space Mono", monospace; color: #00bfff; letter-spacing: 2.5px; font-weight: 700; margin-bottom: 3px;';

  const subTitle = document.createElement('div');
  const opLabel = _getOperationLabel(op);
  subTitle.textContent = `${opLabel}${op === 'read' || op === 'info' || op === 'delete' ? '' : ':'}`;
  subTitle.style.cssText = 'font-size: 18px; font-weight: 700; color: #fff; line-height: 1.3;';

  const riskLevel = _getOpRisk(op);
  const riskColor = _getOpRiskColor(op);
  const riskBadge = document.createElement('div');
  riskBadge.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 8px;
    background: rgba(${riskLevel === 'Alto' ? '255, 107, 107' : '46, 213, 115'}, 0.12);
    border: 1px solid rgba(${riskLevel === 'Alto' ? '255, 107, 107' : '46, 213, 115'}, 0.3);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 10px;
    font-weight: 600;
    color: ${riskColor};
    letter-spacing: 0.5px;
    text-transform: uppercase;
  `;
  riskBadge.innerHTML = `${riskLevel === 'Alto' ? '⚠️' : '✅'} Nivel de riesgo: ${riskLevel}`;

  titleWrapper.appendChild(title);
  titleWrapper.appendChild(subTitle);
  titleWrapper.appendChild(riskBadge);
  header.appendChild(icon);
  header.appendChild(titleWrapper);

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size: 13.5px; line-height: 1.7; color: #b0c8d8; margin-bottom: 16px;';
  desc.innerHTML = 'Jarvis ha solicitado acceso a su sistema de archivos para realizar la siguiente operación. <strong style="color:#e8f4ff;">Revise la ubicación antes de decidir.</strong>';

  const pathDisplay = document.createElement('div');
  pathDisplay.style.cssText = `
    background: rgba(2, 5, 9, 0.6);
    border: 1px solid rgba(0, 191, 255, 0.15);
    border-radius: 10px;
    padding: 14px 18px;
    font-size: 12px;
    font-family: 'Space Mono', 'Consolas', monospace;
    margin-bottom: 16px;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
  `;
  pathDisplay.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <span style="color: rgba(0, 191, 255, 0.6); font-weight: bold; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;">Ubicación</span>
      <span style="color: #7ecfff; font-size: 11px;">${opLabel.toUpperCase()}</span>
    </div>
    <div style="color: #fff; word-break: break-all; font-size: 11.5px; opacity: 0.9;">${path}</div>
  `;

  const infoBox = document.createElement('div');
  infoBox.className = 'perm-info';
  infoBox.innerHTML = `
    <strong>🔍 ¿Qué significa cada opción?</strong><br>
    • <strong>Denegar</strong> — El acceso no se concederá. Jarvis buscará otra alternativa.<br>
    • <strong>Permitir una vez</strong> — Se accede solo ahora. Jarvis volverá a preguntar en el futuro.<br>
    • <strong>Permitir siempre</strong> — Jarvis recordará su decisión y no volverá a preguntar. Solo recomendado si confía plenamente.
  `;

  const warning = document.createElement('div');
  const isHighRisk = _getOpRisk(op) === 'Alto';
  warning.style.cssText = `
    font-size: 11.5px;
    color: ${isHighRisk ? '#ff6b6b' : '#ffb86c'};
    margin-bottom: 22px;
    display: flex; gap: 10px; align-items: flex-start;
    line-height: 1.55;
    background: rgba(${isHighRisk ? '255, 107, 107' : '255, 184, 108'}, 0.06);
    border: 1px solid rgba(${isHighRisk ? '255, 107, 107' : '255, 184, 108'}, 0.15);
    border-radius: 10px;
    padding: 12px 16px;
  `;
  if (isHighRisk) {
    warning.innerHTML = '⚠️ <span style="opacity: 0.9;">Esta operación puede <strong>modificar o eliminar archivos</strong> en su sistema. Al seleccionar <strong>"Permitir siempre"</strong>, Jarvis podrá realizar esta acción sin solicitar confirmación. Asegúrese de confiar plenamente.</span>';
  } else {
    warning.innerHTML = 'ℹ️ <span style="opacity: 0.9;">Al seleccionar <strong>"Permitir siempre"</strong>, Jarvis podrá acceder a esta ubicación en el futuro sin solicitar su confirmación. Seleccione esta opción solo si confía plenamente en Jarvis.</span>';
  }

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px;';

  function _makeBtn(text, cls, value) {
    const btn = document.createElement('button');
    btn.className = `perm-btn ${cls}`;
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
  const allBtn = _makeBtn('Permitir siempre', 'all', 'all');

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

export function requestFilePermission(path, operation) {
  return new Promise((resolve) => {
    if (_activeResolve) {
      _activeResolve('deny');
      _activeResolve = null;
    }
    _activeResolve = resolve;
    _buildDialog(path, operation);
  });
}

export function cancelPendingPermission() {
  if (_activeResolve) {
    _activeResolve('deny');
    _activeResolve = null;
  }
  if (_dialogEl) {
    _dialogEl.remove();
    _dialogEl = null;
  }
}
