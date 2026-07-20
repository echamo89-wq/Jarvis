let _authCallback = null;

const ONBOARDED_KEY = 'jarvis_onboarded';
const CREATOR_KEY = 'jarvis_creator_mode';
const VERSION_KEY = 'jarvis_app_version';

export function onAuth(callback) {
  _authCallback = callback;
}

function _updateProgress(step) {
  const dots = document.querySelectorAll('.auth-progress-dot');
  const lines = document.querySelectorAll('.auth-progress-line');
  dots.forEach((d, i) => {
    d.classList.remove('active', 'done');
    if (i + 1 === step) d.classList.add('active');
    else if (i + 1 < step) d.classList.add('done');
  });
  lines.forEach((l, i) => {
    l.classList.remove('done');
    if (i + 1 < step) l.classList.add('done');
  });
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
      localStorage.setItem(VERSION_KEY, currentVersion);
      try {
        const savedKey = await window.electronAPI?.secureCredentialGet('GEMINI_API_KEY');
        if (savedKey && savedKey.trim().length >= 10) {
          localStorage.setItem(CREATOR_KEY, 'true');
          localStorage.setItem(ONBOARDED_KEY, 'true');
          _hideAuth();
          if (_authCallback) {
            _authCallback({ authed: true, user: { tier: 'local', email: 'local@jarvis.local', username: 'Modo Local' } });
          }
          return true;
        }
      } catch (e) { /* secure storage no disponible */ }
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
  void overlay.offsetWidth;
  overlay.classList.add('active');
}

function _hideAuth() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  const onEnd = () => {
    overlay.style.display = 'none';
    overlay.removeEventListener('transitionend', onEnd);
  };
  overlay.addEventListener('transitionend', onEnd);
  setTimeout(() => { if (overlay.style.display !== 'none') overlay.style.display = 'none'; }, 300);
}

function _showStep(stepId) {
  document.querySelectorAll('.auth-step').forEach(s => s.classList.remove('active'));
  const step = document.getElementById('auth-step-' + stepId);
  if (step) step.classList.add('active');

  const stepMap = { welcome: 1, 'gemini-key': 2, voice: 3, personality: 4, permissions: 5, ready: 6 };
  const num = stepMap[stepId] || 1;
  _updateProgress(num);
}

function _getStepNum(stepId) {
  const map = { welcome: 1, 'gemini-key': 2, voice: 3, personality: 4, permissions: 5, ready: 6 };
  return map[stepId] || 1;
}

export function forceReauth() {
  import('../system/reminders.js').then(m => m.syncBackupNow()).catch(() => {});
  const reminders = localStorage.getItem('jarvis_reminders');
  try { window.electronAPI?.secureCredentialDelete('GEMINI_API_KEY'); } catch (e) {}
  localStorage.removeItem(ONBOARDED_KEY);
  localStorage.removeItem(CREATOR_KEY);
  localStorage.removeItem(VERSION_KEY);
  if (reminders) localStorage.setItem('jarvis_reminders', reminders);
  location.reload();
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

function _showFinalConfirmation() {
  const overlay = document.getElementById('auth-confirm-overlay');
  if (!overlay) { _completeOnboarding(); return; }

  const cats = ['system', 'files', 'screen', 'integrations'];
  cats.forEach(cat => {
    const cb = document.querySelector(`.auth-perm-item[data-category="${cat}"] .auth-perm-toggle`);
    const item = overlay.querySelector(`.auth-confirm-perm[data-cat="${cat}"]`);
    if (item) {
      item.style.display = cb?.checked ? 'flex' : 'none';
    }
  });

  overlay.style.display = 'flex';
  void overlay.offsetWidth;
  overlay.classList.add('active');
}

function _hideFinalConfirmation() {
  const overlay = document.getElementById('auth-confirm-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    const onEnd = () => {
      overlay.style.display = 'none';
      overlay.removeEventListener('transitionend', onEnd);
    };
    overlay.addEventListener('transitionend', onEnd);
    setTimeout(() => { if (overlay.style.display !== 'none') overlay.style.display = 'none'; }, 300);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;

  // Step 1: Welcome
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
    if (window.electronAPI?.secureCredentialGet) {
      window.electronAPI.secureCredentialGet('GEMINI_API_KEY').then(savedKey => {
        if (savedKey && savedKey.trim().length >= 10) {
          if (localStorage.getItem(ONBOARDED_KEY) !== 'true') {
            _completeOnboarding();
          }
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
          setTimeout(() => _showStep('voice'), 600);
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

  document.getElementById('auth-gemini-skip-btn')?.addEventListener('click', () => {
    _showStep('voice');
  });

  // Step 3: Voice & Gender
  let _selectedGender = null;
  const genderMale = document.getElementById('auth-gender-male');
  const genderFemale = document.getElementById('auth-gender-female');
  const voiceSelect = document.getElementById('auth-voice-select');

  function _filterVoicesByGender(gender) {
    if (!voiceSelect) return;
    const maleVoices = ['Fenrir', 'Puck', 'Charon'];
    const femaleVoices = ['Aoede', 'Athena'];
    const voices = gender === 'female' ? femaleVoices : maleVoices;
    Array.from(voiceSelect.options).forEach(opt => {
      const isMatch = voices.some(v => opt.value.startsWith(v));
      opt.style.display = isMatch ? '' : 'none';
    });
    if (voiceSelect.value && !voices.some(v => voiceSelect.value.startsWith(v))) {
      voiceSelect.value = voices[0];
    }
  }

  if (genderMale) {
    genderMale.addEventListener('click', () => {
      genderMale.classList.add('selected');
      genderFemale?.classList.remove('selected');
      _selectedGender = 'male';
      _filterVoicesByGender('male');
    });
  }
  if (genderFemale) {
    genderFemale.addEventListener('click', () => {
      genderFemale.classList.add('selected');
      genderMale?.classList.remove('selected');
      _selectedGender = 'female';
      _filterVoicesByGender('female');
    });
  }

  document.getElementById('auth-voice-btn')?.addEventListener('click', () => {
    if (!_selectedGender) {
      genderMale?.classList.add('selected');
      _selectedGender = 'male';
      _filterVoicesByGender('male');
    }
    const voice = voiceSelect?.value || 'Fenrir';
    localStorage.setItem('jarvis_voice', voice);
    localStorage.setItem('jarvis_voice_gender', _selectedGender);
    _showStep('personality');
  });

  // Step 4: Personality
  const personalityBtns = document.querySelectorAll('.auth-personality-btn');
  personalityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      personalityBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('auth-personality-btn')?.addEventListener('click', () => {
    const active = document.querySelector('.auth-personality-btn.active');
    const personality = active?.getAttribute('data-value') || 'companion';
    localStorage.setItem('jarvis_personality', personality);
    _showStep('permissions');
  });

  // Step 5: Permissions
  document.getElementById('auth-permissions-btn')?.addEventListener('click', () => {
    const cats = ['system', 'files', 'screen', 'integrations'];
    cats.forEach(cat => {
      const cb = document.querySelector(`.auth-perm-item[data-category="${cat}"] .auth-perm-toggle`);
      const key = 'jarvis_cat_' + cat;
      localStorage.setItem(key, cb?.checked ? '1' : '0');
    });
    _showStep('ready');
    // Update summary
    const apiSummary = document.getElementById('summ-api');
    const voiceSummary = document.getElementById('summ-voice');
    const persSummary = document.getElementById('summ-personality');
    if (apiSummary) {
      window.electronAPI?.secureCredentialGet('GEMINI_API_KEY').then(key => {
        apiSummary.textContent = key ? '✓ Configurada' : '— Modo demo';
      }).catch(() => { apiSummary.textContent = '— Modo demo'; });
    }
    if (voiceSummary) {
      const v = localStorage.getItem('jarvis_voice') || 'Fenrir';
      const g = localStorage.getItem('jarvis_voice_gender') || 'male';
      voiceSummary.textContent = `${v} (${g === 'male' ? 'Masculino' : 'Femenino'})`;
    }
    if (persSummary) {
      const names = { companion: 'Compañero', professional: 'Profesional', friendly: 'Amigable', strategic: 'Estratégico', humorous: 'Humorístico' };
      const personality = localStorage.getItem('jarvis_personality') || 'professional';
      persSummary.textContent = names[personality] || personality;
    }
    const permSummary = document.getElementById('summ-permissions');
    if (permSummary) {
      const activePerms = [];
      if (localStorage.getItem('jarvis_cat_system') !== '0') activePerms.push('Sistema');
      if (localStorage.getItem('jarvis_cat_files') !== '0') activePerms.push('Archivos');
      if (localStorage.getItem('jarvis_cat_screen') !== '0') activePerms.push('Pantalla');
      if (localStorage.getItem('jarvis_cat_integrations') !== '0') activePerms.push('Integraciones');
      permSummary.textContent = activePerms.length === 4 ? 'Todos activados' : activePerms.join(', ') || 'Ninguno';
    }
  });

  // Step 6: Ready -> Show confirmation dialog
  document.getElementById('auth-ready-btn')?.addEventListener('click', () => {
    _showFinalConfirmation();
  });

  // Final confirmation dialog buttons
  document.getElementById('auth-confirm-cancel')?.addEventListener('click', () => {
    _hideFinalConfirmation();
  });

  document.getElementById('auth-confirm-accept')?.addEventListener('click', () => {
    _hideFinalConfirmation();
    _completeOnboarding();
  });

  // Close on overlay click
  document.getElementById('auth-confirm-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) _hideFinalConfirmation();
  });

  // Back buttons
  document.querySelectorAll('.auth-back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) _showStep(target);
    });
  });
});