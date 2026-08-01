/**
 * Bridge: engines/system/connection-guardian.js
 * Re-exporta todo desde el guardian canónico (js/system/connection-guardian.js).
 * Hay UNA sola instancia del guardian con UN solo timer de 8s.
 * No duplicar lógica aquí.
 */
export {
  initConnectionGuardian,
  stopConnectionGuardian,
  invalidateModeCache
} from '../../system/connection-guardian.js';
