import { store } from '../state/store.js';

const PLAN_KEY = 'plans';
let _writeTimer = null;

function _getPlans() {
  const memory = store.get('userMemory') || {};
  return memory[PLAN_KEY] || [];
}

function _savePlans(plans) {
  const memory = store.get('userMemory');
  if (!memory) return false;
  memory[PLAN_KEY] = plans;
  if (_writeTimer) clearTimeout(_writeTimer);
  _writeTimer = setTimeout(() => {
    _writeTimer = null;
    try {
      if (window.electronAPI?.memoryWrite) window.electronAPI.memoryWrite(memory);
    } catch (e) {
      console.error('[PLANS] Error al guardar:', e);
    }
  }, 300);
  return true;
}

export function createPlan(title, goal, steps, category) {
  const plans = _getPlans();
  const plan = {
    id: 'plan_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    title,
    goal: goal || '',
    category: category || 'general',
    steps: (steps || []).map((s, i) => ({
      id: 'step_' + Date.now().toString(36) + '_' + i,
      index: i,
      desc: typeof s === 'string' ? s : (s.desc || s.description || ''),
      status: 'pending',
      result: null,
      error: null
    })),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null
  };
  plans.push(plan);
  return _savePlans(plans) ? plan : null;
}

export function listPlans(category, status) {
  let plans = _getPlans();
  if (category) plans = plans.filter(p => p.category === category);
  if (status) plans = plans.filter(p => p.status === status);
  return plans.reverse();
}

export function getPlan(id) {
  return _getPlans().find(p => p.id === id) || null;
}

export function updatePlan(id, updates) {
  const plans = _getPlans();
  const plan = plans.find(p => p.id === id);
  if (!plan) return null;
  Object.assign(plan, updates);
  plan.updatedAt = new Date().toISOString();
  return _savePlans(plans) ? plan : null;
}

export function updateStep(planId, stepIndex, status, result, error) {
  const plans = _getPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan || !plan.steps[stepIndex]) return null;
  const step = plan.steps[stepIndex];
  step.status = status;
  if (result !== undefined) step.result = result;
  if (error !== undefined) step.error = error;
  plan.updatedAt = new Date().toISOString();
  const allDone = plan.steps.every(s => s.status === 'done' || s.status === 'failed');
  if (allDone) {
    plan.status = plan.steps.every(s => s.status === 'done') ? 'completed' : 'failed';
    if (plan.status === 'completed') plan.completedAt = new Date().toISOString();
  }
  return _savePlans(plans) ? { plan, step } : null;
}

export function deletePlan(id) {
  const plans = _getPlans();
  const idx = plans.findIndex(p => p.id === id);
  if (idx === -1) return false;
  plans.splice(idx, 1);
  return _savePlans(plans);
}

export function flushPlans() {
  if (_writeTimer) {
    clearTimeout(_writeTimer);
    _writeTimer = null;
  }
  try {
    const memory = store.get('userMemory');
    if (memory && window.electronAPI?.memoryWrite) {
      window.electronAPI.memoryWrite(memory);
    }
  } catch (e) {
    console.error('[PLANS] Error en flush:', e);
  }
}

export function getActivePlansSummary(maxPlans) {
  const plans = _getPlans().filter(p => p.status === 'active');
  if (plans.length === 0) return '';
  const sorted = plans.slice(-(maxPlans || 10));
  return `\nPLANES ACTIVOS:\n${sorted.map(p => `  "${p.title}" (${p.steps.filter(s => s.status === 'done').length}/${p.steps.length} pasos)`).join('\n')}`;
}
