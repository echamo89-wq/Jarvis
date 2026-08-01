// ──────────────────────────────────────────────────────────────
// dev-console.js — Consola de desarrollo en tiempo real para JARVIS
// Toggle: Ctrl+` (grave) o botón en la UI
// ──────────────────────────────────────────────────────────────

import { getLogs } from '../kernel/logger.js';

const LEVEL_COLORS = {
  DEBUG: '#888',
  INFO:  '#7ecfff',
  WARN:  '#ffd166',
  ERROR: '#ff6b6b',
};

const TAG_COLORS = [
  '#a29bfe', '#74b9ff', '#55efc4', '#fdcb6e',
  '#e17055', '#fd79a8', '#00cec9', '#6c5ce7',
];

let _panel = null;
let _list  = null;
let _open  = false;
let _filter = '';
let _tagColorMap = new Map();
let _autoScroll  = true;
let _lastCount   = 0;
let _rafId       = null;
let _tagIndex    = 0;

function _tagColor(tag) {
  if (!_tagColorMap.has(tag)) {
    _tagColorMap.set(tag, TAG_COLORS[_tagIndex % TAG_COLORS.length]);
    _tagIndex++;
  }
  return _tagColorMap.get(tag);
}

function _formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function _buildPanel() {
  if (_panel) return;

  // ── Estilos ──────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = 'jarvis-dev-console-style';
  style.textContent = `
    #jarvis-dev-console {
      position: fixed;
      bottom: 0; right: 0;
      width: 680px; height: 340px;
      background: rgba(10, 10, 18, 0.97);
      border: 1px solid rgba(126, 207, 255, 0.15);
      border-bottom: none; border-right: none;
      border-top-left-radius: 10px;
      backdrop-filter: blur(12px);
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      line-height: 1.5;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      box-shadow: -4px -4px 24px rgba(0,0,0,0.5);
      transform: translateY(100%);
      transition: transform 0.2s cubic-bezier(0.16,1,0.3,1);
      user-select: text;
    }
    #jarvis-dev-console.open {
      transform: translateY(0);
    }
    #jdc-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: rgba(126,207,255,0.05);
      border-bottom: 1px solid rgba(126,207,255,0.1);
      cursor: move;
      flex-shrink: 0;
    }
    #jdc-title {
      font-size: 10px;
      font-weight: 700;
      color: #7ecfff;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      flex: 1;
    }
    #jdc-badge {
      font-size: 9px;
      background: rgba(126,207,255,0.12);
      color: #7ecfff;
      padding: 1px 6px;
      border-radius: 99px;
      letter-spacing: 0.5px;
    }
    #jdc-filter {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px;
      color: #e0e0e0;
      font-family: inherit;
      font-size: 10px;
      padding: 2px 6px;
      width: 120px;
      outline: none;
    }
    #jdc-filter:focus { border-color: rgba(126,207,255,0.4); }
    .jdc-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px;
      color: #888;
      font-size: 10px;
      padding: 2px 7px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    }
    .jdc-btn:hover { color: #fff; border-color: rgba(255,255,255,0.2); }
    #jdc-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 4px 0;
    }
    #jdc-body::-webkit-scrollbar { width: 4px; }
    #jdc-body::-webkit-scrollbar-track { background: transparent; }
    #jdc-body::-webkit-scrollbar-thumb { background: rgba(126,207,255,0.15); border-radius: 2px; }
    .jdc-row {
      display: flex;
      align-items: baseline;
      padding: 1px 10px;
      gap: 6px;
      border-bottom: none;
    }
    .jdc-row:hover { background: rgba(255,255,255,0.03); }
    .jdc-time { color: #444; font-size: 9px; flex-shrink: 0; width: 72px; }
    .jdc-level { font-size: 9px; font-weight: 700; flex-shrink: 0; width: 36px; }
    .jdc-tag {
      font-size: 9px; font-weight: 600;
      flex-shrink: 0; width: 76px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .jdc-msg {
      color: #ccc;
      word-break: break-word;
      flex: 1;
      white-space: pre-wrap;
    }
    .jdc-msg .jdc-hi { background: rgba(255,214,102,0.2); color: #ffd166; border-radius: 2px; }
    #jdc-status {
      padding: 3px 10px;
      font-size: 9px;
      color: #444;
      border-top: 1px solid rgba(255,255,255,0.04);
      flex-shrink: 0;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    #jdc-autoscroll-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #55efc4;
      display: inline-block;
      margin-right: 3px;
      transition: background 0.2s;
    }
    #jdc-autoscroll-dot.off { background: #444; }
    #jdc-resize-handle {
      position: absolute;
      top: 0; left: 0;
      width: 6px; height: 100%;
      cursor: ew-resize;
    }
  `;
  document.head.appendChild(style);

  // ── Panel HTML ───────────────────────────────────────────────
  _panel = document.createElement('div');
  _panel.id = 'jarvis-dev-console';
  _panel.innerHTML = `
    <div id="jdc-resize-handle"></div>
    <div id="jdc-header">
      <span id="jdc-title">⌨ JARVIS CONSOLE</span>
      <span id="jdc-badge">0 entradas</span>
      <input id="jdc-filter" type="text" placeholder="Filtrar…" spellcheck="false"/>
      <button class="jdc-btn" id="jdc-clear-btn">Limpiar</button>
      <button class="jdc-btn" id="jdc-close-btn">✕</button>
    </div>
    <div id="jdc-body"></div>
    <div id="jdc-status">
      <span><span id="jdc-autoscroll-dot"></span>Auto-scroll</span>
      <span id="jdc-count-status">0 logs</span>
      <span style="flex:1"></span>
      <span style="color:#555">Ctrl+1 — toggle | clic en fondo = scroll</span>
    </div>
  `;
  document.body.appendChild(_panel);
  _list = _panel.querySelector('#jdc-body');

  // ── Interactividad ───────────────────────────────────────────
  _panel.querySelector('#jdc-close-btn').addEventListener('click', toggleDevConsole);
  _panel.querySelector('#jdc-clear-btn').addEventListener('click', () => {
    _list.innerHTML = '';
    _lastCount = getLogs().length;
  });
  const filterInput = _panel.querySelector('#jdc-filter');
  filterInput.addEventListener('input', (e) => {
    _filter = e.target.value.toLowerCase();
    _rebuildAll();
  });
  _list.addEventListener('scroll', () => {
    const atBottom = _list.scrollHeight - _list.scrollTop - _list.clientHeight < 20;
    _autoScroll = atBottom;
    document.getElementById('jdc-autoscroll-dot')?.classList.toggle('off', !_autoScroll);
  });

  // ── Drag to resize width ─────────────────────────────────────
  const rh = _panel.querySelector('#jdc-resize-handle');
  let _dragging = false, _startX = 0, _startW = 0;
  rh.addEventListener('mousedown', (e) => {
    _dragging = true;
    _startX = e.clientX;
    _startW = _panel.offsetWidth;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!_dragging) return;
    const delta = _startX - e.clientX;
    _panel.style.width = Math.max(380, Math.min(1200, _startW + delta)) + 'px';
  });
  document.addEventListener('mouseup', () => { _dragging = false; });

  // ── Hook al kernel logger via bus ────────────────────────────
  if (window._jarvisKernel?.bus) {
    window._jarvisKernel.bus.on('kernel:log', (entry) => {
      if (_open) _appendEntry(entry);
    });
  }
}

function _highlight(msg, filter) {
  if (!filter) return _escHtml(msg);
  const escaped = _escHtml(msg);
  const re = new RegExp(filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return escaped.replace(re, m => `<span class="jdc-hi">${m}</span>`);
}

function _escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _makeRow(entry) {
  const show = !_filter ||
    entry.message.toLowerCase().includes(_filter) ||
    entry.tag.toLowerCase().includes(_filter) ||
    entry.level.toLowerCase().includes(_filter);
  if (!show) return null;

  const row = document.createElement('div');
  row.className = 'jdc-row';

  const color = LEVEL_COLORS[entry.level] || '#ccc';
  const tagColor = _tagColor(entry.tag);
  const msgHtml = _highlight(String(entry.message).substring(0, 400), _filter);

  row.innerHTML = `
    <span class="jdc-time">${_formatTime(entry.timestamp)}</span>
    <span class="jdc-level" style="color:${color}">${entry.level}</span>
    <span class="jdc-tag" style="color:${tagColor}">${_escHtml(entry.tag)}</span>
    <span class="jdc-msg">${msgHtml}</span>
  `;
  return row;
}

function _appendEntry(entry) {
  if (!_list) return;
  const row = _makeRow(entry);
  if (!row) return;
  _list.appendChild(row);
  // Keep max 600 rows in DOM
  while (_list.children.length > 600) _list.removeChild(_list.firstChild);
  if (_autoScroll) _list.scrollTop = _list.scrollHeight;
  _updateBadge();
}

function _rebuildAll() {
  if (!_list) return;
  _list.innerHTML = '';
  const logs = getLogs();
  const fragment = document.createDocumentFragment();
  for (const entry of logs) {
    const row = _makeRow(entry);
    if (row) fragment.appendChild(row);
  }
  _list.appendChild(fragment);
  if (_autoScroll) _list.scrollTop = _list.scrollHeight;
  _updateBadge();
}

function _updateBadge() {
  const count = getLogs().length;
  const badge = document.getElementById('jdc-badge');
  const countStatus = document.getElementById('jdc-count-status');
  if (badge) badge.textContent = `${count} entradas`;
  if (countStatus) countStatus.textContent = `${count} logs`;
}

// Polling para capturar logs que llegan antes de que el bus esté disponible
function _startPolling() {
  if (_rafId) return;
  let lastPoll = 0;
  function _poll(ts) {
    if (!_open) { _rafId = null; return; }
    _rafId = requestAnimationFrame(_poll);
    if (ts - lastPoll < 250) return; // poll cada 250ms
    lastPoll = ts;
    const logs = getLogs();
    if (logs.length !== _lastCount) {
      const newEntries = logs.slice(_lastCount);
      _lastCount = logs.length;
      for (const e of newEntries) _appendEntry(e);
    }
  }
  _rafId = requestAnimationFrame(_poll);
}

export function toggleDevConsole() {
  _buildPanel();
  _open = !_open;
  _panel.classList.toggle('open', _open);

  if (_open) {
    _rebuildAll();
    _lastCount = getLogs().length;
    _startPolling();
    document.getElementById('jdc-filter')?.focus();
  } else {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  }
}

export function isDevConsoleOpen() { return _open; }

// ── Keyboard shortcut: Ctrl+1 ────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key === '1' || e.code === 'Digit1')) {
    e.preventDefault();
    toggleDevConsole();
  }
});
