export class RealityEngine {
  constructor() {
    this._situation = null;
    this._goal = null;
  }

  loadFromMemory(memory) {
    if (memory?.situation) this._situation = memory.situation;
    if (memory?.goal) this._goal = memory.goal;
  }

  setSituation(text) { this._situation = text; }
  setGoal(text) { this._goal = text; }

  evaluate(confidence) {
    if (confidence > 90) return { correction: null, message: 'Objetivo realista y alcanzable.' };
    if (confidence > 70) return { correction: 'optimismo_leve', message: 'Objetivo posible pero requiere planificación cuidadosa.' };
    if (confidence > 40) return { correction: 'optimismo_moderado', message: 'Recomiendo ajustar expectativas a la baja.' };
    return { correction: 'optimismo_excesivo', message: 'Este objetivo parece poco realista dadas las circunstancias actuales.' };
  }

  getProfileBlock() {
    return this._situation
      ? `SITUACIÓN ACTUAL: ${this._situation}. OBJETIVO: ${this._goal || 'No definido'}.`
      : 'SIN INFORMACIÓN DE SITUACIÓN.';
  }
}
