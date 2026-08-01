import { store } from '../state/store.js';
import { bus } from '../utils/event-bus.js';
import { createLogger } from '../utils/logger.js';

const _log = createLogger('MODEL-MGR');

export function getMode() { return 'cloud'; }
export function isLocal() { return false; }
export function isDownloading() { return false; }
export function getAudioRestartLog() { return false; }
export function setAudioRestartLog() {}
export function getLocalModel() { return null; }
export function getScanState() { return 'inactive'; }

export async function initModelView(container) {
  if (!container) return;
  container.innerHTML = `
    <div style="padding:20px;text-align:center;">
      <div style="font-size:1rem;color:var(--primary);margin-bottom:8px;">Solo modo Gemini Cloud</div>
      <div style="font-size:0.75rem;color:var(--text-dim);">
        Los modelos locales han sido desactivados. Jarvis funciona exclusivamente con Gemini.
      </div>
    </div>
  `;
}

export async function switchModel(mode) {
  if (mode === 'local') {
    _log.warn('Modo local no disponible — solo Gemini');
    return { success: false, error: 'Modelos locales desactivados' };
  }
  return { success: true };
}

export async function refreshModels() {
  return [];
}

export function initModelUI() {}
export function syncSidebarStatus() {}
