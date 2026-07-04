let _hideTimer = null;
let _lastContent = '';

const ICONS = {
  report: '📊', research: '🔬', news: '📰', weather: '🌤',
  youtube: '🎬', info: '📄', warning: '⚠️', success: '✅',
  error: '❌'
};

export function showInfoPanel(opts) {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

  const icon = ICONS[opts.type] || opts.icon || '📄';
  const title = opts.title || 'INFORME';
  const source = opts.source || '';
  const subtitle = opts.subtitle || '';
  const summary = opts.summary || '';
  const points = opts.keyPoints || [];
  const details = opts.details || '';
  const sources = opts.sources || [];
  const rawContent = opts.rawContent || summary + '\n' + points.join('\n') + '\n' + details;

  _lastContent = rawContent;

  document.getElementById('ip-icon').textContent = icon;
  document.getElementById('ip-title').textContent = title;
  document.getElementById('ip-source').textContent = source ? `— ${source}` : '';

  const subEl = document.getElementById('ip-subtitle');
  if (subtitle) { subEl.textContent = subtitle; subEl.style.display = 'block'; }
  else subEl.style.display = 'none';

  const sumEl = document.getElementById('ip-summary');
  if (summary) { sumEl.textContent = summary; sumEl.style.display = 'block'; }
  else sumEl.style.display = 'none';

  const ptsEl = document.getElementById('ip-points');
  if (points.length > 0) {
    ptsEl.textContent = '';
    points.forEach(p => {
      const div = document.createElement('div');
      div.className = 'ip-point';
      div.textContent = '◆ ' + p;
      ptsEl.appendChild(div);
    });
    ptsEl.style.display = 'block';
  } else ptsEl.style.display = 'none';

  const detEl = document.getElementById('ip-details');
  if (details) { detEl.textContent = details; detEl.style.display = 'block'; }
  else detEl.style.display = 'none';

  const srcEl = document.getElementById('ip-sources');
  if (sources.length > 0) {
    srcEl.textContent = '';
    sources.forEach(s => {
      const domain = s.replace(/https?:\/\//, '').split('/')[0];
      const span = document.createElement('span');
      span.className = 'ip-source-bubble';
      span.textContent = domain;
      srcEl.appendChild(span);
    });
    srcEl.style.display = 'flex';
  } else srcEl.style.display = 'none';

  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.classList.add('visible'));

  _hideTimer = setTimeout(() => hideInfoPanel(), 45000);
}

export function hideInfoPanel() {
  const panel = document.getElementById('info-panel');
  if (!panel) return;
  panel.classList.remove('visible');
  setTimeout(() => { panel.style.display = 'none'; }, 250);
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
}

export function initInfoPanel() {
  document.getElementById('ip-close')?.addEventListener('click', hideInfoPanel);

  document.getElementById('ip-download-btn')?.addEventListener('click', () => {
    if (!_lastContent) return;
    const title = document.getElementById('ip-title')?.textContent || 'informe';
    const blob = new Blob([_lastContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.toLowerCase().replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('ip-copy-btn')?.addEventListener('click', async () => {
    if (!_lastContent) return;
    try {
      await navigator.clipboard.writeText(_lastContent);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = _lastContent;
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  });

  document.getElementById('ip-view-btn')?.addEventListener('click', () => {
    if (!_lastContent) return;
    import('../documents/artifacts.js').then(m => {
      const title = document.getElementById('ip-title')?.textContent || 'informe';
      m.addArtifact(_lastContent, 'markdown', title);
    });
    hideInfoPanel();
  });
}
