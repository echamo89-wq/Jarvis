/**
 * splash.js — Ventana de carga circular mínima de JARVIS
 * Anillo de progreso que se llena según el boot real del renderer y cierra solo.
 */

const api = window.electronAPI;
const ring = document.getElementById('ring');
const statusEl = document.getElementById('status-text');
let _finished = false;

// Guardar SO detectado para el resto de la app
if (api && api.getPlatform) {
  const platform = api.getPlatform();
  if (localStorage) {
    localStorage.setItem('jarvis_os', platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : 'windows');
  }
}

function setProgress(pct) {
  if (!ring) return;
  const p = Math.max(0, Math.min(100, pct));
  ring.style.background = `conic-gradient(#00bfff 0deg, #8a2be2 ${p}%, rgba(255,255,255,0.08) ${p}%, rgba(255,255,255,0.08) 100%)`;
}

function startProtocol() {
  if (_finished) return;
  _finished = true;
  document.body.classList.add('done');
  setTimeout(() => {
    if (api && api.splashFinished) api.splashFinished();
  }, 350);
}

if (api) {
  api.onSplashProgress(({ pct }) => setProgress(pct || 0));

  api.onSplashDone(() => {
    setProgress(100);
    setTimeout(startProtocol, 650);
  });

  api.onSplashError((errorMsg) => {
    if (ring) {
      ring.style.background = 'conic-gradient(#ff453a 0deg, #ff453a 100%, rgba(255,255,255,0.08) 100%)';
    }
    if (statusEl) {
      statusEl.textContent = 'ERROR';
      statusEl.style.display = 'block';
    }
    setTimeout(startProtocol, 1500);
  });

  api.splashReady();
}
