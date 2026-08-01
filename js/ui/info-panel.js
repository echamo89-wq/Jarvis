let _hideTimer = null;
let _lastContent = '';

// Mapa de fuentes: nombre → { color, icon SVG/letra, abbr }
const SOURCE_META = {
  'Google':        { color: '#4285f4', letter: 'G', label: 'Google' },
  'DuckDuckGo':    { color: '#de5833', letter: '🦆', label: 'DDG' },
  'Wikipedia':     { color: '#a7a7a7', letter: 'W', label: 'Wiki' },
  'Google News':   { color: '#ea4335', letter: 'N', label: 'G.News' },
  'Reddit':        { color: '#ff4500', letter: 'r/', label: 'Reddit' },
  'YouTube':       { color: '#ff0000', letter: '▶', label: 'YouTube' },
  'GitHub':        { color: '#6e40c9', letter: '⬡', label: 'GitHub' },
  'Stack Overflow':{ color: '#f48024', letter: 'SO', label: 'S.O.' },
  'Hacker News':   { color: '#ff6600', letter: 'Y', label: 'HN' },
  'Dev.to':        { color: '#0a0a0a', letter: 'D', label: 'Dev.to' },
  'Medium':        { color: '#1a1a1a', letter: 'M', label: 'Medium' },
  'BBC':           { color: '#b80000', letter: 'BBC', label: 'BBC' },
  'Reuters':       { color: '#ff8000', letter: 'R', label: 'Reuters' },
};

function _getSourceMeta(name) {
  for (const [k, v] of Object.entries(SOURCE_META)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  const letter = name.charAt(0).toUpperCase();
  return { color: '#00bfff', letter, label: name.substring(0, 6) };
}

function _ensureStyles() {
  if (document.getElementById('ip-v2-styles')) return;
  const style = document.createElement('style');
  style.id = 'ip-v2-styles';
  style.textContent = `
    .info-panel-v2 {
      width: 100%;
      max-width: 560px;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      margin: 8px auto 0;
      opacity: 0;
      transform: translateY(12px) scale(0.98);
      transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      background: rgba(8, 15, 30, 0.92);
      border: 1px solid rgba(0, 191, 255, 0.18);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,0.55),
                  0 0 30px rgba(0, 191, 255, 0.08),
                  inset 0 0 40px rgba(0, 191, 255, 0.03);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .info-panel-v2.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .ipv2-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px 10px 14px;
      border-bottom: 1px solid rgba(0, 191, 255, 0.1);
      background: rgba(0, 191, 255, 0.04);
    }
    .ipv2-type-badge {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: 2px;
      font-weight: 700;
      color: #00bfff;
      background: rgba(0, 191, 255, 0.1);
      border: 1px solid rgba(0, 191, 255, 0.2);
      border-radius: 4px;
      padding: 2px 6px;
      text-transform: uppercase;
    }
    .ipv2-title {
      font-size: 13px;
      font-weight: 700;
      color: #e8f4ff;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.5px;
    }
    .ipv2-source-count {
      font-size: 11px;
      color: rgba(0, 191, 255, 0.7);
      font-family: 'Space Mono', monospace;
    }
    .ipv2-close {
      background: none;
      border: none;
      color: rgba(100, 150, 180, 0.6);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
      transition: color 0.2s;
      line-height: 1;
    }
    .ipv2-close:hover { color: #ff7675; }
    .ipv2-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
      max-height: 280px;
      font-size: 13px;
      line-height: 1.65;
      color: #c8dde9;
      scrollbar-width: thin;
      scrollbar-color: rgba(0, 191, 255, 0.2) transparent;
    }
    .ipv2-body::-webkit-scrollbar {
      width: 4px;
    }
    .ipv2-body::-webkit-scrollbar-track { background: transparent; }
    .ipv2-body::-webkit-scrollbar-thumb {
      background: rgba(0, 191, 255, 0.25);
      border-radius: 2px;
    }
    .ipv2-section {
      margin-bottom: 14px;
    }
    .ipv2-section:last-child { margin-bottom: 0; }
    .ipv2-section-label {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: 1.5px;
      color: rgba(0, 191, 255, 0.5);
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .ipv2-summary {
      font-size: 13px;
      line-height: 1.65;
      color: #d8e8f4;
    }
    .ipv2-point {
      display: flex;
      gap: 6px;
      margin-bottom: 5px;
      align-items: flex-start;
    }
    .ipv2-point-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #00bfff;
      flex-shrink: 0;
      margin-top: 6px;
      box-shadow: 0 0 6px rgba(0, 191, 255, 0.5);
    }
    .ipv2-point-text {
      font-size: 12.5px;
      color: #b8d0de;
      line-height: 1.5;
    }
    .ipv2-details {
      font-size: 12px;
      color: rgba(180, 210, 230, 0.6);
      line-height: 1.5;
      font-style: italic;
      border-left: 2px solid rgba(0, 191, 255, 0.15);
      padding-left: 10px;
    }
    .ipv2-footer {
      display: flex;
      align-items: center;
      padding: 8px 14px;
      border-top: 1px solid rgba(0, 191, 255, 0.08);
      gap: 8px;
      background: rgba(0, 191, 255, 0.025);
    }
    .ipv2-sources {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      flex: 1;
      overflow: hidden;
    }
    .ipv2-src-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 20px;
      padding: 0 7px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
      font-family: 'Space Mono', monospace;
      letter-spacing: 0.5px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.5);
      cursor: default;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .ipv2-src-chip:hover {
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.8);
      transform: translateY(-1px);
    }
    .ipv2-src-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .ipv2-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .ipv2-action-btn {
      background: rgba(0, 191, 255, 0.07);
      border: 1px solid rgba(0, 191, 255, 0.15);
      color: rgba(0, 191, 255, 0.7);
      cursor: pointer;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 5px;
      transition: all 0.2s;
    }
    .ipv2-action-btn:hover {
      background: rgba(0, 191, 255, 0.15);
      color: #00bfff;
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(style);
}

function _buildPanel() {
  _ensureStyles();
  const old = document.getElementById('info-panel-v2');
  if (old) old.remove();

  const panel = document.createElement('div');
  panel.id = 'info-panel-v2';
  panel.className = 'info-panel-v2';
  panel.style.display = 'none';

  panel.innerHTML = `
    <div class="ipv2-header">
      <span class="ipv2-type-badge" id="ipv2-badge">INVESTIGACIÓN</span>
      <span class="ipv2-title" id="ipv2-title">INFORME</span>
      <span class="ipv2-source-count" id="ipv2-src-count"></span>
      <button class="ipv2-close" id="ipv2-close">✕</button>
    </div>
    <div class="ipv2-body" id="ipv2-body">
      <div class="ipv2-section" id="ipv2-summary-section" style="display:none">
        <div class="ipv2-section-label">Resumen</div>
        <div class="ipv2-summary" id="ipv2-summary"></div>
      </div>
      <div class="ipv2-section" id="ipv2-points-section" style="display:none">
        <div class="ipv2-section-label">Puntos clave</div>
        <div id="ipv2-points"></div>
      </div>
      <div class="ipv2-section" id="ipv2-details-section" style="display:none">
        <div class="ipv2-section-label">Contexto adicional</div>
        <div class="ipv2-details" id="ipv2-details"></div>
      </div>
    </div>
    <div class="ipv2-footer">
      <div class="ipv2-sources" id="ipv2-sources"></div>
      <div class="ipv2-actions">
        <button class="ipv2-action-btn" id="ipv2-copy-btn" title="Copiar">📋</button>
        <button class="ipv2-action-btn" id="ipv2-dl-btn" title="Descargar">⬇</button>
      </div>
    </div>
  `;

  // Insertar entre #message-area y .chat-bar
  const anchor = document.getElementById('message-area');
  const chatBar = document.querySelector('.chat-bar');
  if (anchor && anchor.parentElement) {
    if (chatBar) {
      anchor.parentElement.insertBefore(panel, chatBar);
    } else {
      anchor.parentElement.appendChild(panel);
    }
  } else {
    document.body.appendChild(panel);
  }

  return panel;
}

export function showResearchBadge() {}
export function hideResearchBadge() {}

export function showInfoPanel(opts) {
  hideInfoPanel();
}

export function hideInfoPanel() {
  const panel = document.getElementById('info-panel-v2');
  if (panel) {
    panel.classList.remove('visible');
    panel.style.display = 'none';
  }
  const legacy = document.getElementById('info-panel');
  if (legacy) legacy.style.display = 'none';
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
}

export function initInfoPanel() {}
