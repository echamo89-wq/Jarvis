import { createLogger } from '../utils/logger.js';
const _log = createLogger('TASKBUBBLE');
let _el = null;
let _total = 0;
let _timer = null;

function _create() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.id = 'task-bar';
  _el.className = 'task-bar';
  document.getElementById('message-area')?.after(_el);
  return _el;
}

export function showTaskBubble(total) {
  _total = total;
  const el = _create();
  el.style.display = 'flex';
  clearTimeout(_timer);
}

export function updateTask(current, label, state) {
  const el = _create();
  el.textContent = '';
  const stepSpan = document.createElement('span');
  stepSpan.className = 'tb-step';
  stepSpan.textContent = current + '/' + _total;
  el.appendChild(stepSpan);
  const labelSpan = document.createElement('span');
  labelSpan.className = 'tb-label';
  if (state === 'active') {
    labelSpan.innerHTML = '⏳ ' + label;
  } else if (state === 'done') {
    labelSpan.innerHTML = '✅ ' + label;
  } else {
    labelSpan.textContent = label;
  }
  el.appendChild(labelSpan);
  const barSpan = document.createElement('span');
  barSpan.className = 'tb-bar';
  const fillSpan = document.createElement('span');
  fillSpan.className = 'tb-fill';
  fillSpan.style.width = (current / _total) * 100 + '%';
  if (state === 'done') fillSpan.style.background = 'var(--success)';
  barSpan.appendChild(fillSpan);
  el.appendChild(barSpan);
}

export function completeTaskBubble() {
  const el = _create();
  const labelSpan = el.querySelector('.tb-label');
  if (labelSpan) labelSpan.innerHTML = '✅ Completado';
  _timer = setTimeout(hideTaskBubble, 2500);
}

export function hideTaskBubble() {
  if (_el) _el.style.display = 'none';
  clearTimeout(_timer);
}
