import { store } from '../../../state/store.js';
import { createLogger } from '../../../utils/logger.js';
const _log = createLogger('SCHEDULER');

const _timers = new Map();
let _timerIdCounter = 0;

export function scheduleStep(planId, stepId, delayMs, onFire) {
  if (delayMs < 0) return { error: 'delayMs debe ser >= 0' };
  const timerId = ++_timerIdCounter;
  const timeout = setTimeout(() => {
    _timers.delete(timerId);
    _log('info', `[SCHEDULER] Ejecutando paso programado ${stepId} (plan ${planId})`);
    try { onFire(); } catch (e) { _log('error', `[SCHEDULER] Error: ${e.message}`); }
  }, delayMs);
  _timers.set(timerId, { timeout, planId, stepId, delayMs, createdAt: Date.now() });
  _log('info', `[SCHEDULER] Paso ${stepId} programado en ${delayMs}ms (timer ${timerId})`);
  return { timerId };
}

export function scheduleReplan(planId, delayMs = 5000, onReplan) {
  const timerId = ++_timerIdCounter;
  const timeout = setTimeout(() => {
    _timers.delete(timerId);
    _log('info', `[SCHEDULER] Replanificación programada para plan ${planId}`);
    try { onReplan(); } catch (e) { _log('error', `[SCHEDULER] Error en replan: ${e.message}`); }
  }, delayMs);
  _timers.set(timerId, { timeout, planId, delayMs, createdAt: Date.now(), isReplan: true });
  _log('info', `[SCHEDULER] Replanificación programada en ${delayMs}ms`);
  return { timerId };
}

export function cancelTimer(timerId) {
  const entry = _timers.get(timerId);
  if (!entry) return { error: `Timer ${timerId} no encontrado` };
  clearTimeout(entry.timeout);
  _timers.delete(timerId);
  _log('info', `[SCHEDULER] Timer ${timerId} cancelado`);
  return { success: true };
}

export function cancelPlanTimers(planId) {
  let count = 0;
  for (const [id, entry] of _timers) {
    if (entry.planId === planId) {
      clearTimeout(entry.timeout);
      _timers.delete(id);
      count++;
    }
  }
  if (count > 0) _log('info', `[SCHEDULER] ${count} timer(s) cancelados para plan ${planId}`);
  return { cancelled: count };
}

export function getActiveTimers() {
  return Array.from(_timers.entries()).map(([id, entry]) => ({
    timerId: id,
    planId: entry.planId,
    stepId: entry.stepId || null,
    delayMs: entry.delayMs,
    remaining: Math.max(0, entry.delayMs - (Date.now() - entry.createdAt)),
    isReplan: entry.isReplan || false
  }));
}

export function clearAllTimers() {
  for (const [, entry] of _timers) clearTimeout(entry.timeout);
  _timers.clear();
  _log('info', '[SCHEDULER] Todos los timers cancelados');
}
