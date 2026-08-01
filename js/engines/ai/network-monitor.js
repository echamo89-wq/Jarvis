import { store } from '../../state/store.js';
import { createLogger } from '../../utils/logger.js';

const _log = createLogger('NET-MONITOR');

let _initialized = false;

export function initNetworkMonitor() {
  if (_initialized) return;
  _initialized = true;
  store.set('_activeProvider', 'gemini');
  localStorage.setItem('jarvis_active_provider', 'gemini');
  _log('info', 'Network Monitor: solo modo Gemini (local models eliminados)');
}

export function stopNetworkMonitor() {
  _initialized = false;
}

export function setManualMode() {}
export function enableAutoMode() {}
export function isAutoModeEnabled() { return true; }
