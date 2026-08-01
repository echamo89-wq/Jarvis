import { createLogger } from '../../../utils/logger.js';
const _log = createLogger('PLANNER');

function _genId() {
  return 'step_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export class Planner {
  constructor() {
    this._plan = null;
  }

  get plan() { return this._plan; }

  createPlan(goal, rawSteps = []) {
    const steps = rawSteps.map((s, i) => {
      const desc = typeof s === 'string' ? s : s.desc;
      return {
        id: _genId(),
        index: i,
        desc,
        status: i === 0 ? 'in_progress' : 'pending',
        result: null,
        error: null,
        attempts: 0,
        maxAttempts: s.maxAttempts || 3,
        duration: 0,
        startedAt: null,
        completedAt: null,
        dependsOn: s.dependsOn || [],
        condition: s.condition || null,
        tool: s.tool || null,
        args: s.args || {}
      };
    });

    this._plan = {
      id: 'plan_' + Date.now().toString(36),
      goal,
      steps,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      context: {}
    };

    _log('info', `Plan creado: "${goal}" — ${steps.length} pasos`);
    return this._serialize();
  }

  getStep(id) {
    return this._plan?.steps.find(s => s.id === id) || null;
  }

  getCurrentStep() {
    if (!this._plan) return null;
    return this._plan.steps.find(s => s.status === 'in_progress' || (s.status === 'pending' && s.dependsOn.every(d => this.getStep(d)?.status === 'done'))) || null;
  }

  getNextSteps() {
    if (!this._plan) return [];
    return this._plan.steps.filter(s =>
      s.status === 'pending' &&
      s.dependsOn.every(d => {
        const dep = this.getStep(d);
        return dep && dep.status === 'done';
      })
    );
  }

  startStep(id) {
    const step = this.getStep(id);
    if (!step) return { error: `Paso "${id}" no encontrado` };
    if (step.status !== 'pending') return { error: `Paso "${id}" ya está ${step.status}` };
    const depsUnmet = step.dependsOn.filter(d => {
      const dep = this.getStep(d);
      return !dep || dep.status !== 'done';
    });
    if (depsUnmet.length > 0) return { error: `Dependencias insatisfechas: ${depsUnmet.join(', ')}` };
    if (step.condition) {
      _log('info', `Evaluando condición para ${id}: ${step.condition}`);
    }
    step.status = 'in_progress';
    step.attempts++;
    step.startedAt = Date.now();
    step.error = null;
    this._plan.updatedAt = Date.now();
    return { success: true, step: this._serializeStep(step) };
  }

  completeStep(id, result) {
    const step = this.getStep(id);
    if (!step) return { error: `Paso "${id}" no encontrado` };
    step.status = 'done';
    step.result = typeof result === 'string' ? result.substring(0, 5000) : JSON.stringify(result).substring(0, 5000);
    step.duration = Date.now() - (step.startedAt || Date.now());
    step.completedAt = Date.now();
    this._plan.updatedAt = Date.now();
    const next = this.getNextSteps();
    if (next.length > 0) {
      next[0].status = 'in_progress';
      next[0].attempts++;
      next[0].startedAt = Date.now();
      _log('info', `Paso ${id} completado. Siguiente: ${next[0].desc}`);
    } else if (this._plan.steps.every(s => s.status === 'done')) {
      this._plan.status = 'completed';
      _log('info', `Plan completado: "${this._plan.goal}"`);
    } else {
      _log('info', `Paso ${id} completado. Esperando dependencias para continuar.`);
    }
    return { success: true, plan: this._serialize() };
  }

  failStep(id, error) {
    const step = this.getStep(id);
    if (!step) return { error: `Paso "${id}" no encontrado` };
    step.error = error;
    step.duration = Date.now() - (step.startedAt || Date.now());
    if (step.attempts < step.maxAttempts) {
      step.status = 'pending';
      step.startedAt = null;
      _log('warn', `Paso ${id} falló (intento ${step.attempts}/${step.maxAttempts}): ${error}`);
      this._plan.updatedAt = Date.now();
      return { success: true, retry: true, attemptsLeft: step.maxAttempts - step.attempts, step: this._serializeStep(step) };
    } else {
      step.status = 'failed';
      this._plan.status = 'failed';
      this._plan.updatedAt = Date.now();
      _log('error', `Paso ${id} falló definitivamente: ${error}`);
      return { success: true, retry: false, step: this._serializeStep(step), planFailed: true };
    }
  }

  cancelPlan() {
    if (!this._plan) return { error: 'No hay plan activo' };
    this._plan.status = 'cancelled';
    this._plan.updatedAt = Date.now();
    this._plan.steps.forEach(s => { if (s.status === 'in_progress') s.status = 'pending'; });
    _log('info', `Plan cancelado: "${this._plan.goal}"`);
    return { success: true };
  }

  getSummary() {
    if (!this._plan) return null;
    const done = this._plan.steps.filter(s => s.status === 'done').length;
    const failed = this._plan.steps.filter(s => s.status === 'failed').length;
    const total = this._plan.steps.length;
    const current = this.getCurrentStep();
    return {
      goal: this._plan.goal,
      status: this._plan.status,
      progress: `${done}/${total}`,
      failed,
      currentStep: current ? { id: current.id, desc: current.desc } : null,
      nextSteps: this.getNextSteps().map(s => ({ id: s.id, desc: s.desc }))
    };
  }

  _serializeStep(s) {
    return { id: s.id, desc: s.desc, status: s.status, attempts: s.attempts, maxAttempts: s.maxAttempts, error: s.error, duration: s.duration, dependsOn: s.dependsOn, condition: s.condition, tool: s.tool };
  }

  _serialize() {
    return {
      id: this._plan.id,
      goal: this._plan.goal,
      status: this._plan.status,
      steps: this._plan.steps.map(s => this._serializeStep(s)),
      createdAt: this._plan.createdAt,
      summary: this.getSummary()
    };
  }

  loadPlan(data) {
    if (data) this._plan = data;
  }
}
