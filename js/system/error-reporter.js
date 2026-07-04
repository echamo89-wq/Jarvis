let _lastError = null;
let _toastEl = null;
// Configure your support email here, or leave empty to disable the mailto fallback
const FEEDBACK_EMAIL = '';

function _ensureToast() {
  if (_toastEl) return;
  _toastEl = document.createElement('div');
  _toastEl.id = 'error-toast';
  _toastEl.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:9999;background:rgba(255,59,48,0.12);border:1px solid rgba(255,59,48,0.4);border-radius:8px;padding:10px 14px;max-width:320px;display:none;backdrop-filter:blur(8px);';
  _toastEl.innerHTML = `
    <div style="font-size:0.7rem;color:var(--danger);margin-bottom:6px;font-weight:600;">⚠ ERROR CRÍTICO</div>
    <div id="error-toast-msg" style="font-size:0.65rem;color:var(--text-dim);margin-bottom:8px;word-break:break-word;"></div>
    <div style="display:flex;gap:6px;">
      <button id="error-toast-report" style="flex:1;padding:4px 8px;font-size:0.6rem;background:var(--danger);color:#fff;border:none;border-radius:4px;cursor:pointer;">📸 Capturar y reportar</button>
      <button id="error-toast-dismiss" style="padding:4px 8px;font-size:0.6rem;background:rgba(255,255,255,0.1);color:var(--text-dim);border:none;border-radius:4px;cursor:pointer;">✕</button>
    </div>
  `;
  document.body.appendChild(_toastEl);

  _toastEl.querySelector('#error-toast-report')?.addEventListener('click', async () => {
    _toastEl.style.display = 'none';
    const msgEl = document.getElementById('error-toast-msg');
    const errorText = msgEl?.textContent || 'Error desconocido';
    const reportBtn = _toastEl.querySelector('#error-toast-report');
    if (reportBtn) reportBtn.disabled = true;

    let screenshotPath = '';
    if (window.electronAPI?.captureScreenshot) {
      const result = await window.electronAPI.captureScreenshot();
      if (result.success) screenshotPath = result.filepath;
    }

    const user = localStorage.getItem('jarvis_username') || 'anon';
    const version = '1.0.0';

    // 1) Intentar Formspree con captura adjunta
    let sent = false;
    if (window.electronAPI?.sendFeedbackEmail && screenshotPath) {
      const result = await window.electronAPI.sendFeedbackEmail({
        message: `[ERROR] ${errorText}`,
        user, version,
        filepath: screenshotPath
      });
      sent = result.success;
    }

    if (!sent) {
      const subject = encodeURIComponent(`JARVIS Error - ${user}`);
      const body = encodeURIComponent(
        `Error: ${errorText}\n\nUsuario: ${user}\nVersión: ${version}\nTimestamp: ${new Date().toISOString()}${screenshotPath ? `\nCaptura: ${screenshotPath}` : ''}`
      );
      window.open(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`, '_blank');
    }
    if (reportBtn) reportBtn.disabled = false;
  });

  _toastEl.querySelector('#error-toast-dismiss')?.addEventListener('click', () => {
    _toastEl.style.display = 'none';
  });
}

export function showErrorToast(errorMessage) {
  _ensureToast();
  _lastError = errorMessage;
  const msgEl = document.getElementById('error-toast-msg');
  if (msgEl) msgEl.textContent = errorMessage.slice(0, 200);
  _toastEl.style.display = 'block';
  setTimeout(() => { if (_toastEl) _toastEl.style.display = 'none'; }, 30000);
}

export function initErrorReporter() {
  _ensureToast();

  window.addEventListener('error', (e) => {
    const msg = `${e.message} (${e.filename}:${e.lineno}:${e.colno})`;
    console.error('[ERROR-REPORTER]', msg);
    if (e.error?.critical || e.message?.includes('Fallo en') || e.message?.includes('[LOG_SYSTEM_CRITICAL]')) {
      showErrorToast(msg);
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message || e.reason || 'Unhandled promise rejection';
    console.error('[ERROR-REPORTER]', msg);
    if (msg.includes('Fallo en') || msg.includes('[LOG_SYSTEM_CRITICAL]')) {
      showErrorToast(msg);
    }
  });
}
