let _authCallback = null;

const ONBOARDED_KEY = 'jarvis_onboarded';
const CREATOR_KEY = 'jarvis_creator_mode';
const VERSION_KEY = 'jarvis_app_version';

export function onAuth(callback) {
  _authCallback = callback;
}

export async function checkAuth() {
  try {
    let currentVersion = null;
    try {
      currentVersion = window.electronAPI?.getAppVersion ? await window.electronAPI.getAppVersion() : null;
    } catch (e) {}
    const storedVersion = localStorage.getItem(VERSION_KEY);

    if (currentVersion && storedVersion !== currentVersion) {
      localStorage.removeItem(ONBOARDED_KEY);
      localStorage.removeItem(CREATOR_KEY);
      localStorage.removeItem('jarvis_gemini_api_key');
      localStorage.setItem(VERSION_KEY, currentVersion);
      _showAuth();
      _showStep('welcome');
      return false;
    }

    const creatorMode = localStorage.getItem(CREATOR_KEY) === 'true';
    const onboarded = localStorage.getItem(ONBOARDED_KEY) === 'true';

    if (!onboarded) {
      _showAuth();
      _showStep('welcome');
      return false;
    }

    if (!creatorMode) {
      _showAuth();
      _showStep('gemini-key');
      return false;
    }

    const apiCheck = window.electronAPI?.checkApiKey ? await window.electronAPI.checkApiKey() : null;
    if (!apiCheck?.configured) {
      localStorage.removeItem(CREATOR_KEY);
      localStorage.removeItem(ONBOARDED_KEY);
      localStorage.removeItem('jarvis_gemini_api_key');
      _showAuth();
      _showStep('welcome');
      return false;
    }

    _hideAuth();
    if (_authCallback) {
      _authCallback({ authed: true, user: { tier: 'local', email: 'local@jarvis.local', username: 'Modo Local' } });
    }
    return true;
  } catch (e) {
    console.error('[AUTH] Error en checkAuth:', e);
    _showAuth();
    _showStep('welcome');
    return false;
  }
}

function _showAuth() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  // Force reflow so transition fires correctly
  void overlay.offsetWidth;
  overlay.classList.add('active');
}

function _hideAuth() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  // Wait for CSS opacity transition before hiding
  const onEnd = () => {
    overlay.style.display = 'none';
    overlay.removeEventListener('transitionend', onEnd);
  };
  overlay.addEventListener('transitionend', onEnd);
  // Fallback in case transitionend doesn't fire
  setTimeout(() => { if (overlay.style.display !== 'none') overlay.style.display = 'none'; }, 300);
}

function _showStep(stepId) {
  document.querySelectorAll('.auth-step').forEach(s => s.classList.remove('active'));
  const step = document.getElementById('auth-step-' + stepId);
  if (step) step.classList.add('active');
}

function _completeOnboarding() {
  localStorage.setItem(ONBOARDED_KEY, 'true');
  localStorage.setItem(CREATOR_KEY, 'true');
  if (window.electronAPI?.getAppVersion) {
    window.electronAPI.getAppVersion().then(v => localStorage.setItem(VERSION_KEY, v)).catch(() => {});
  }
  _hideAuth();
  if (_authCallback) {
    _authCallback({ authed: true, user: { tier: 'local', email: 'local@jarvis.local', username: 'Modo Local' } });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;

  document.getElementById('auth-welcome-btn')?.addEventListener('click', () => _showStep('gemini-key'));

  // Step 2: Gemini API key
  const keyInput = document.getElementById('auth-gemini-key-input');
  const toggleBtn = document.getElementById('auth-gemini-toggle');
  const saveBtn = document.getElementById('auth-gemini-save-btn');
  const errorEl = document.getElementById('auth-gemini-error');
  const statusEl = document.getElementById('auth-gemini-status');

  if (toggleBtn && keyInput) {
    toggleBtn.addEventListener('click', () => {
      const isPass = keyInput.type === 'password';
      keyInput.type = isPass ? 'text' : 'password';
      toggleBtn.textContent = isPass ? '🙈' : '👁';
    });
  }

  if (keyInput) {
    // Si la clave ya existe en el almacenamiento seguro de Windows, la rellenamos automáticamente
    if (window.electronAPI?.secureCredentialGet) {
      window.electronAPI.secureCredentialGet('GEMINI_API_KEY').then(savedKey => {
        if (savedKey && savedKey.trim().length >= 10) {
          keyInput.value = savedKey.trim();
          if (saveBtn) saveBtn.disabled = false;
        }
      }).catch(() => {});
    }

    keyInput.addEventListener('input', () => {
      const valid = keyInput.value.trim().length >= 10;
      if (saveBtn) saveBtn.disabled = !valid;
      if (errorEl) errorEl.style.display = 'none';
      if (statusEl) statusEl.style.display = 'none';
    });
  }

  if (saveBtn && keyInput) {
    saveBtn.addEventListener('click', async () => {
      const key = keyInput.value.trim();
      if (!key || key.length < 10) {
        if (errorEl) { errorEl.textContent = 'La API key parece inválida (muy corta)'; errorEl.style.display = 'block'; }
        return;
      }
      
      const loadingEl = document.getElementById('auth-gemini-loading');
      saveBtn.style.display = 'none';
      if (loadingEl) loadingEl.style.display = 'flex';
      if (errorEl) errorEl.style.display = 'none';
      if (statusEl) statusEl.style.display = 'none';

      try {
        const result = await window.electronAPI?.setupGeminiKey(key);
        if (!result?.success) throw new Error(result?.error || 'Error al guardar la key');

        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        if (resp.ok && data.models) {
          if (statusEl) {
            statusEl.textContent = 'Conexión exitosa con Gemini';
            statusEl.style.color = '#2ed573';
            statusEl.style.background = 'rgba(46,213,115,0.08)';
            statusEl.style.display = 'block';
          }
          if (loadingEl) loadingEl.style.display = 'none';
          localStorage.setItem('jarvis_gemini_api_key', key);
          setTimeout(() => _completeOnboarding(), 800);
        } else {
          const msg = data?.error?.message || 'Key inválida o sin permisos';
          if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
          if (loadingEl) loadingEl.style.display = 'none';
          saveBtn.disabled = false;
          saveBtn.style.display = 'block';
          saveBtn.textContent = 'Guardar y continuar';
        }
      } catch (err) {
        if (errorEl) { errorEl.textContent = 'Error de conexión: ' + err.message; errorEl.style.display = 'block'; }
        if (loadingEl) loadingEl.style.display = 'none';
        saveBtn.disabled = false;
        saveBtn.style.display = 'block';
        saveBtn.textContent = 'Guardar y continuar';
      }
    });
  }

  // Skip API key → complete onboarding without key
  document.getElementById('auth-gemini-skip-btn')?.addEventListener('click', () => {
    _completeOnboarding();
  });
});
