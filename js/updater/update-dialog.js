import { createLogger } from '../utils/logger.js';
const _log = createLogger('UPDATER');

let _updateDialog = null;
let _updateOverlay = null;

export function initUpdaterUI() {
  _updateDialog = document.getElementById('update-dialog');
  _updateOverlay = document.getElementById('update-overlay');
  if (!_updateDialog) {
    _log('error', 'Update dialog elements not found in DOM');
    return;
  }
  loadVersionDisplay();
  setupListeners();
}

async function loadVersionDisplay() {
  try {
    const version = await window.electronAPI.getAppVersion();
    const el = document.getElementById('about-version');
    if (el) el.textContent = `v${version}`;
  } catch {}
}

function setupListeners() {
  window.electronAPI?.onUpdateAvailable?.((data) => {
    showUpdateAvailable(data);
  });
  window.electronAPI?.onUpdateNotAvailable?.((data) => {
    const btn = document.getElementById('check-for-updates-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Buscar actualizaciones'; }
    if (_updateDialog?.classList.contains('visible')) {
      showToast('Ya tienes la última versión');
    }
  });
  window.electronAPI?.onUpdateError?.((data) => {
    showUpdateError(data.message);
  });
  window.electronAPI?.onUpdateDownloadProgress?.((data) => {
    updateProgress(data.percent);
  });
  window.electronAPI?.onUpdateDownloaded?.((data) => {
    showUpdateReady(data.version);
  });
  listenForMenuCheck();
}

function listenForMenuCheck() {
  document.addEventListener('click', (e) => {
    if (e.target.id === 'check-for-updates-btn') {
      checkForUpdates();
    }
  });
}

export async function checkForUpdates() {
  const btn = document.getElementById('check-for-updates-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Buscando...';
  }
  try {
    const result = await window.electronAPI.checkForUpdates();
    if (result?.error) {
      showToast('Error al buscar actualizaciones');
      if (btn) { btn.disabled = false; btn.textContent = 'Buscar actualizaciones'; }
    }
  } catch (e) {
    _log('error', `checkForUpdates: ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Buscar actualizaciones'; }
  }
  // Re-enable if no update found (handled by onUpdateNotAvailable listener)
  setTimeout(() => {
    if (btn) { btn.disabled = false; btn.textContent = 'Buscar actualizaciones'; }
  }, 8000);
}

function _actionBtn() { return _updateDialog?.querySelector('#update-action-btn'); }

function showUpdateAvailable(data) {
  _updateDialog.querySelector('.update-version').textContent = `v${data.version}`;
  _updateDialog.querySelector('.update-notes').textContent = data.releaseNotes || 'Mejoras y correcciones.';
  _updateDialog.querySelector('.update-status').textContent = 'Nueva versión disponible';
  _actionBtn().textContent = 'Descargar';
  _actionBtn().onclick = downloadUpdate;
  _actionBtn().disabled = false;
  _updateDialog.querySelector('.update-progress-container').classList.remove('active');
  _updateDialog.querySelector('.update-progress-fill').style.width = '0%';
  _updateDialog.classList.add('visible');
  _updateOverlay?.classList.add('visible');
}

function showUpdateReady(version) {
  _updateDialog.querySelector('.update-status').textContent = 'Descarga completa';
  _updateDialog.querySelector('.update-version').textContent = `v${version}`;
  _actionBtn().textContent = 'Reiniciar ahora';
  _actionBtn().onclick = installUpdate;
  _actionBtn().disabled = false;
  _updateDialog.querySelector('.update-progress-container').classList.remove('active');
  _updateDialog.querySelector('.update-progress-fill').style.width = '100%';
  _updateDialog.querySelector('.update-progress-label').textContent = '100%';
}

async function downloadUpdate() {
  _actionBtn().disabled = true;
  _actionBtn().textContent = 'Descargando...';
  _updateDialog.querySelector('.update-status').textContent = 'Descargando actualización...';
  _updateDialog.querySelector('.update-progress-container').classList.add('active');
  try {
    await window.electronAPI.downloadUpdate();
  } catch (e) {
    showUpdateError(e.message);
  }
}

function updateProgress(percent) {
  const fill = _updateDialog.querySelector('.update-progress-fill');
  const label = _updateDialog.querySelector('.update-progress-label');
  if (fill) fill.style.width = `${percent}%`;
  if (label) label.textContent = `${percent}%`;
}

async function installUpdate() {
  _updateDialog.querySelector('.update-status').textContent = 'Instalando...';
  _actionBtn().textContent = 'Reiniciando...';
  _actionBtn().disabled = true;
  try {
    await window.electronAPI.installUpdate();
  } catch (e) {
    showUpdateError(e.message);
  }
}

function showUpdateError(message) {
  _log('error', `Update error: ${message}`);
  _updateDialog.querySelector('.update-status').textContent = 'Error en la actualización';
  _actionBtn().textContent = 'Cerrar';
  _actionBtn().onclick = closeUpdateDialog;
  _actionBtn().disabled = false;
}

export function closeUpdateDialog() {
  _updateDialog?.classList.remove('visible');
  _updateOverlay?.classList.remove('visible');
}

function showToast(msg) {
  const toast = document.getElementById('update-toast');
  if (toast) {
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3000);
  }
}