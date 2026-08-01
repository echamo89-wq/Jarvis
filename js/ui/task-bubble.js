import { createLogger } from '../utils/logger.js';
import { store } from '../state/store.js';

const _log = createLogger('TASKBUBBLE');

let _el = null;
let _total = 0;
let _timer = null;
let _lastLabel = '';
let _lastState = '';

function _create() {
  if (_el && document.body.contains(_el)) return _el;
  _el = document.createElement('div');
  _el.id = 'task-bar';
  _el.className = 'task-bar';

  const msgArea = document.getElementById('message-area');
  if (msgArea && msgArea.parentNode) {
    msgArea.after(_el);
  } else {
    document.body.appendChild(_el);
  }
  return _el;
}

function _detectActionInfo(label) {
  const lower = (label || '').toLowerCase();
  if (lower.includes('inspeccion') || lower.includes('organiz') || lower.includes('carpet') || lower.includes('folder') || lower.includes('dir')) {
    return { icon: '📁', category: 'SISTEMA DE ARCHIVOS', accent: '#63b3ed' };
  }
  if (lower.includes('busc') || lower.includes('search') || lower.includes('web') || lower.includes('google') || lower.includes('duckduckgo')) {
    return { icon: '🔍', category: 'BÚSQUEDA WEB', accent: '#40c4ff' };
  }
  if (lower.includes('investig') || lower.includes('research')) {
    return { icon: '📚', category: 'INVESTIGACIÓN PROFUNDA', accent: '#b388ff' };
  }
  if (lower.includes('analiz') || lower.includes('leyend') || lower.includes('read') || lower.includes('fetch') || lower.includes('page') || lower.includes('pantalla') || lower.includes('screenshot')) {
    return { icon: '🌐', category: 'ANÁLISIS DE CONTENIDO', accent: '#64ffda' };
  }
  if (lower.includes('descarg') || lower.includes('youtube') || lower.includes('download') || lower.includes('video') || lower.includes('media')) {
    return { icon: '📥', category: 'DESCARGA Y MEDIOS', accent: '#ff80ab' };
  }
  if (lower.includes('powershell') || lower.includes('cmd') || lower.includes('ejecut') || lower.includes('terminal') || lower.includes('app') || lower.includes('proceso')) {
    return { icon: '⚡', category: 'EJECUTANDO SISTEMA', accent: '#ffd740' };
  }
  return { icon: '🧠', category: 'KERNEL DE JARVIS', accent: '#63b3ed' };
}

export function showTaskBubble(total) {
  _total = total || 1;
  const el = _create();
  el.style.display = 'flex';
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  el.classList.add('active-working');
  clearTimeout(_timer);
}

export function updateTask(current, label, state = 'active') {
  const el = _create();
  clearTimeout(_timer);
  _lastLabel = label || _lastLabel;
  _lastState = state;

  el.style.display = 'flex';
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  el.textContent = '';

  const { icon, category, accent } = _detectActionInfo(label || _lastLabel);
  const isDone = state === 'done' || state === 'success';
  const isError = state === 'error';

  // 1. Shimmer line overlay (micro-animation)
  const shimmer = document.createElement('div');
  shimmer.className = 'tb-shimmer';
  if (!isDone && !isError) shimmer.classList.add('running');
  el.appendChild(shimmer);

  // 2. Main Row
  const mainRow = document.createElement('div');
  mainRow.className = 'tb-main-row';

  // Left Icon + Pulse Indicator
  const iconBox = document.createElement('div');
  iconBox.className = 'tb-icon-box';
  if (isDone) iconBox.classList.add('done');
  if (isError) iconBox.classList.add('error');

  const iconText = document.createElement('span');
  iconText.className = 'tb-icon-symbol';
  iconText.textContent = isDone ? '✓' : (isError ? '⚠️' : icon);
  iconBox.appendChild(iconText);

  if (!isDone && !isError) {
    const pulseRing = document.createElement('span');
    pulseRing.className = 'tb-pulse-ring';
    pulseRing.style.borderColor = accent;
    iconBox.appendChild(pulseRing);
  }

  mainRow.appendChild(iconBox);

  // Content Info (Category + Detail text)
  const infoBox = document.createElement('div');
  infoBox.className = 'tb-info-box';

  const catHeader = document.createElement('div');
  catHeader.className = 'tb-cat-header';

  const catBadge = document.createElement('span');
  catBadge.className = 'tb-cat-badge';
  catBadge.textContent = category;
  catBadge.style.color = accent;
  catHeader.appendChild(catBadge);

  const statusTag = document.createElement('span');
  statusTag.className = 'tb-status-tag';
  if (isDone) {
    statusTag.textContent = 'COMPLETADO';
    statusTag.classList.add('done');
  } else if (isError) {
    statusTag.textContent = 'FALLO';
    statusTag.classList.add('error');
  } else {
    statusTag.textContent = 'EN EJECUCIÓN';
    statusTag.classList.add('working');

    // Live dot animation
    const liveDot = document.createElement('span');
    liveDot.className = 'tb-live-dot';
    statusTag.appendChild(liveDot);
  }
  catHeader.appendChild(statusTag);
  infoBox.appendChild(catHeader);

  // Action detail text
  const labelText = document.createElement('div');
  labelText.className = 'tb-action-text';
  labelText.textContent = label || _lastLabel || category;
  infoBox.appendChild(labelText);

  mainRow.appendChild(infoBox);

  // Step counter badge
  const stepBadge = document.createElement('div');
  stepBadge.className = 'tb-step-badge';
  stepBadge.textContent = isDone ? `${current}/${_total || 1}` : `PASO ${current}/${_total || 1}`;
  if (isDone) stepBadge.classList.add('done');
  if (isError) stepBadge.classList.add('error');
  mainRow.appendChild(stepBadge);

  el.appendChild(mainRow);

  // 3. Progress Bar
  const barTrack = document.createElement('div');
  barTrack.className = 'tb-bar-track';

  const barFill = document.createElement('div');
  barFill.className = 'tb-bar-fill';
  const targetPct = isDone ? 100 : Math.min(100, Math.max(20, (current / (_total || 1)) * 100));
  barFill.style.width = targetPct + '%';
  barFill.style.background = isDone
    ? 'linear-gradient(90deg, #2ed573, #70d6ff)'
    : (isError ? '#ff4757' : `linear-gradient(90deg, ${accent}, #70d6ff)`);

  barTrack.appendChild(barFill);
  el.appendChild(barTrack);

  // Auto-persist: DO NOT hide prematurely while executing tools or responding
  if (isDone) {
    _timer = setTimeout(() => {
      // Only hide if no tool is executing
      if (!store.get('isExecutingTool')) {
        hideTaskBubble();
      }
    }, 4500);
  }
}

export function completeTaskBubble(message) {
  const el = _create();
  if (!el) return;
  clearTimeout(_timer);

  const statusTag = el.querySelector('.tb-status-tag');
  if (statusTag) {
    statusTag.textContent = message || 'COMPLETADO';
    statusTag.className = 'tb-status-tag done';
  }
  const fill = el.querySelector('.tb-bar-fill');
  if (fill) {
    fill.style.width = '100%';
    fill.style.background = 'linear-gradient(90deg, #2ed573, #70d6ff)';
  }
  const iconSymbol = el.querySelector('.tb-icon-symbol');
  if (iconSymbol) iconSymbol.textContent = '✓';
  const pulseRing = el.querySelector('.tb-pulse-ring');
  if (pulseRing) pulseRing.remove();

  // Smooth persistent transition — stays anchored so user sees JARVIS completed the task
  _timer = setTimeout(() => {
    if (!store.get('isExecutingTool')) {
      hideTaskBubble();
    }
  }, 4000);
}

export function taskErrorBubble(errorText) {
  const el = _create();
  if (!el) return;
  clearTimeout(_timer);

  const statusTag = el.querySelector('.tb-status-tag');
  if (statusTag) {
    statusTag.textContent = 'ERROR';
    statusTag.className = 'tb-status-tag error';
  }
  const actionText = el.querySelector('.tb-action-text');
  if (actionText && errorText) {
    actionText.textContent = errorText;
  }
  const fill = el.querySelector('.tb-bar-fill');
  if (fill) {
    fill.style.width = '100%';
    fill.style.background = '#ff4757';
  }
  const iconSymbol = el.querySelector('.tb-icon-symbol');
  if (iconSymbol) iconSymbol.textContent = '⚠️';
  const pulseRing = el.querySelector('.tb-pulse-ring');
  if (pulseRing) pulseRing.remove();

  _timer = setTimeout(hideTaskBubble, 5000);
}

export function hideTaskBubble(force = false) {
  if (_el) {
    if (!force && store.get('isExecutingTool')) return; // Do not hide while tools are running
    _el.style.opacity = '0';
    _el.style.transform = 'translateY(6px)';
    setTimeout(() => {
      if (_el) {
        _el.style.display = 'none';
        _el.style.opacity = '';
        _el.style.transform = '';
      }
    }, 350);
  }
  clearTimeout(_timer);
}
