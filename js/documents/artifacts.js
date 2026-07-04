let _artifacts = [];
let _codeOverlay = null;

import { createLogger } from '../utils/logger.js';
const _log = createLogger('ARTIFACTS');

function _detectLang(code, langHint) {
  if (langHint) return langHint;
  if (/<\/?[a-z][\s\S]*>/i.test(code.slice(0, 200))) return 'html';
  if (/function\s+\w+\s*\(|=>|const |let |var |import\s|export\s/.test(code.slice(0, 300))) return 'javascript';
  if (/print\(|def\s+\w+\s*\(|import\s+\w+/.test(code.slice(0, 200))) return 'python';
  if (/\.css|{[\s\S]*:[\s\S]*;/.test(code.slice(0, 200))) return 'css';
  if (/^[\s\S]*<\?/.test(code.slice(0, 100))) return 'php';
  return langHint || 'text';
}

function _iconForLang(lang) {
  const icons = {
    html: '🌐', javascript: '🟨', python: '🐍', css: '🎨', json: '📋',
    xml: '📄', markdown: '📝', bash: '💻', powershell: '⚡', sql: '🗃️',
    typescript: '🔷', jsx: '⚛️', tsx: '⚛️', text: '📄'
  };
  return icons[lang] || '📄';
}

export function addArtifact(code, langHint, title) {
  const lang = _detectLang(code, langHint);
  const lines = code.split('\n');
  const preview = lines.slice(0, 3).join('\n').substring(0, 120);
  const name = title || `documento-${_artifacts.length + 1}.${lang}`;
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  _artifacts.unshift({ id, name, code, lang, preview, title: name });
  _renderAll();
  _showPanel();
  _log('info', `Artefacto creado: ${name} (${lang})`);
  return id;
}

export function clearArtifacts() {
  _artifacts = [];
  _renderAll();
}

function _showPanel() {
  const panel = document.getElementById('left-panel');
  if (panel) panel.classList.remove('collapsed');
}

function _renderAll() {
  const body = document.getElementById('lp-body');
  if (!body) return;

  if (_artifacts.length === 0) {
    body.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'lp-empty';
    empty.textContent = 'Aun no hay documentos';
    body.appendChild(empty);
    return;
  }

  body.textContent = '';
  _artifacts.forEach(a => {
    const card = document.createElement('div');
    card.className = 'lp-card';
    card.dataset.id = a.id;

    const header = document.createElement('div');
    header.className = 'lp-card-header';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'lp-card-icon';
    iconSpan.textContent = _iconForLang(a.lang);
    header.appendChild(iconSpan);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'lp-card-title';
    titleSpan.textContent = a.title;
    header.appendChild(titleSpan);

    const langSpan = document.createElement('span');
    langSpan.className = 'lp-card-lang';
    langSpan.textContent = a.lang;
    header.appendChild(langSpan);

    card.appendChild(header);

    const previewDiv = document.createElement('div');
    previewDiv.className = 'lp-card-preview';
    previewDiv.textContent = a.preview;
    card.appendChild(previewDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'lp-card-actions';

    const dlBtn = document.createElement('button');
    dlBtn.className = 'lp-action-btn download';
    dlBtn.dataset.id = a.id;
    dlBtn.textContent = 'Descargar';
    actionsDiv.appendChild(dlBtn);

    const cpBtn = document.createElement('button');
    cpBtn.className = 'lp-action-btn copy';
    cpBtn.dataset.id = a.id;
    cpBtn.textContent = 'Copiar';
    actionsDiv.appendChild(cpBtn);

    const viewBtn = document.createElement('button');
    viewBtn.className = 'lp-action-btn view';
    viewBtn.dataset.id = a.id;
    viewBtn.textContent = 'Ver';
    actionsDiv.appendChild(viewBtn);

    card.appendChild(actionsDiv);
    body.appendChild(card);
  });

  body.querySelectorAll('.lp-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const art = _artifacts.find(a => a.id === id);
      if (!art) return;
      if (btn.classList.contains('download')) _download(art);
      else if (btn.classList.contains('copy')) _copy(art);
      else if (btn.classList.contains('view')) _view(art);
    });
  });
}

function _escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function _download(art) {
  const blob = new Blob([art.code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = art.title;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  _log('info', `Descargado: ${art.title}`);
}

async function _copy(art) {
  try {
    await navigator.clipboard.writeText(art.code);
    _log('info', `Copiado: ${art.title}`);
    const btn = document.querySelector(`.lp-action-btn.copy[data-id="${art.id}"]`);
    if (btn) { btn.textContent = 'Copiado'; setTimeout(() => { btn.textContent = 'Copiar'; }, 2000); }
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = art.code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function _view(art) {
  if (!_codeOverlay) {
    _codeOverlay = document.createElement('div');
    _codeOverlay.className = 'code-overlay';
    _codeOverlay.id = 'code-overlay';
    _codeOverlay.innerHTML = `<div class="code-modal">
      <div class="code-modal-header">
        <span id="code-modal-title"></span>
        <button id="code-modal-download">Descargar</button>
        <button id="code-modal-copy">Copiar</button>
        <button id="code-modal-close">Cerrar</button>
      </div>
      <div class="code-modal-body">
        <pre id="code-modal-content"></pre>
      </div>
    </div>`;
    document.body.appendChild(_codeOverlay);

    _codeOverlay.addEventListener('click', (e) => {
      if (e.target === _codeOverlay) _codeOverlay.classList.remove('active');
    });
    document.getElementById('code-modal-close').addEventListener('click', () => {
      _codeOverlay.classList.remove('active');
    });
    document.getElementById('code-modal-download').addEventListener('click', () => {
      const id = _codeOverlay.dataset.artId;
      const a = _artifacts.find(x => x.id === id);
      if (a) _download(a);
    });
    document.getElementById('code-modal-copy').addEventListener('click', () => {
      const id = _codeOverlay.dataset.artId;
      const a = _artifacts.find(x => x.id === id);
      if (a) _copy(a);
    });
  }

  _codeOverlay.dataset.artId = art.id;
  document.getElementById('code-modal-title').textContent = `${_iconForLang(art.lang)} ${art.title}`;
  document.getElementById('code-modal-content').textContent = art.code;
  _codeOverlay.classList.add('active');
}

export function initArtifactsPanel() {
  const docBtn = document.getElementById('docs-btn');
  const leftPanel = document.getElementById('left-panel');
  if (!docBtn || !leftPanel) return;

  docBtn.addEventListener('click', () => {
    leftPanel.classList.toggle('collapsed');
  });

  document.getElementById('lp-close-btn')?.addEventListener('click', () => {
    leftPanel.classList.add('collapsed');
  });
}
