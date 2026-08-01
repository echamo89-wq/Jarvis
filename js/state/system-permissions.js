import { store } from './store.js';

const SYSTEM_PERM_KEY = '_systemExecutionAllowed';
const STORAGE_KEY = 'jarvis_system_execution_allowed';

function _getPersisted() {
  const cached = store.get(SYSTEM_PERM_KEY);
  if (cached) return cached;
  
  // Fallback a localStorage si el store de la sesión no lo tiene
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val) {
      store.set(SYSTEM_PERM_KEY, val);
      return val;
    }
  } catch (e) {}
  return null;
}

export function isSystemExecutionAllowed() {
  const perm = _getPersisted();
  return perm === 'all';
}

export function grantSystemExecutionAlways() {
  store.set(SYSTEM_PERM_KEY, 'all');
  try {
    localStorage.setItem(STORAGE_KEY, 'all');
  } catch (e) {}
}

export function grantSystemExecutionOnce() {
  store.set(SYSTEM_PERM_KEY, 'once');
}

export function revokeSystemExecution() {
  store.set(SYSTEM_PERM_KEY, null);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}
