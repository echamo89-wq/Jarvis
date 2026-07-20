const api = window.electronAPI;

for (let i = 25; i--;) {
  const p = document.createElement('div');
  p.className = 'particle';
  p.style.left = Math.random() * 100 + '%';
  p.style.animationDuration = (4 + Math.random() * 6) + 's';
  p.style.animationDelay = Math.random() * 4 + 's';
  p.style.width = p.style.height = (1 + Math.random() * 1.5) + 'px';
  document.getElementById('particles').appendChild(p);
}

function updateClock() {
  const now = new Date();
  const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  document.getElementById('ctx-time').textContent = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
  document.getElementById('ctx-date').textContent = days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()];
}
updateClock();
setInterval(updateClock, 1000);

api.getAppVersionSync().then(v => {
  document.getElementById('ctx-version').textContent = 'v' + v;
  const btnSpan = document.querySelector('#start-btn span');
  if (btnSpan) btnSpan.textContent = 'INICIAR SISTEMA v' + v;
}).catch(() => {
  document.getElementById('ctx-version').textContent = 'v3.0.0';
});

const osIconEl = document.getElementById('os-icon-element');
const osTextEl = document.getElementById('os-text-element');
const platform = api.getPlatform();
if (platform === 'darwin') { osIconEl.textContent = '🍎'; osTextEl.textContent = 'macOS detectado'; }
else if (platform === 'linux') { osIconEl.textContent = '🐧'; osTextEl.textContent = 'Linux detectado'; }
else { osIconEl.textContent = '❖'; osTextEl.textContent = 'Windows detectado'; }
localStorage.setItem('jarvis_os', platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : 'windows');

const fill = document.getElementById('progress-fill');
const statusEl = document.getElementById('status-text');
let currentProgress = 0, typingTimer = null;

const THEMED_MESSAGES = [
  { maxPct: 15, msg: "Inicializando protocolos de seguridad..." },
  { maxPct: 35, msg: "Calibrando sistemas vocales..." },
  { maxPct: 55, msg: "Sincronizando matriz cognitiva..." },
  { maxPct: 75, msg: "Estableciendo enlace de alta velocidad con Gemini..." },
  { maxPct: 90, msg: "Activando núcleos de razonamiento estratégicos..." },
  { maxPct: 98, msg: "Integrando memoria persistente local..." },
  { maxPct: 100, msg: "Sistemas JARVIS JS listos." }
];

function typeWriter(text, index) {
  if (index === undefined) { index = 0; statusEl.textContent = ''; }
  if (index < text.length) {
    statusEl.textContent += text.charAt(index);
    typingTimer = setTimeout(function() { typeWriter(text, index + 1); }, 25);
  }
}

function updateStatusMessage(pct) {
  const match = THEMED_MESSAGES.find(m => pct <= m.maxPct) || THEMED_MESSAGES[THEMED_MESSAGES.length - 1];
  if (statusEl.getAttribute('data-current') !== match.msg) {
    statusEl.setAttribute('data-current', match.msg);
    clearTimeout(typingTimer);
    typeWriter(match.msg);
  }
}

function setProgress(pct) {
  currentProgress = Math.max(currentProgress, pct);
  fill.style.width = currentProgress + '%';
  updateStatusMessage(currentProgress);
}

api.onSplashProgress(({ pct }) => setProgress(pct));

api.onSplashDone(() => {
  setProgress(100);
  statusEl.textContent = "Sistemas JARVIS JS listos.";
  const btn = document.getElementById('start-btn');
  if (btn) btn.classList.add('visible');
  setTimeout(() => {
    if (!document.body.classList.contains('done')) startProtocol();
  }, 4000);
});

function startProtocol() {
  document.body.classList.add('done');
  setTimeout(() => api.splashFinished(), 100);
}

api.splashReady();
