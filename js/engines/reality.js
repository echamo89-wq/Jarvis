import { store } from '../state/store.js';

export class RealityEngine {
  constructor() {
    this._situation = null;
    this._goal = null;
    this._confidenceLevel = 85;
  }

  loadFromMemory(memory) {
    if (memory?.situation) this._situation = memory.situation;
    if (memory?.goal) this._goal = memory.goal;
    if (memory?.confidenceLevel) this._confidenceLevel = memory.confidenceLevel;
  }

  toMemory() {
    return {
      situation: this._situation,
      goal: this._goal,
      confidenceLevel: this._confidenceLevel
    };
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
    const memory = store.get('userMemory') || {};
    const objectives = memory.objectives || {};
    const activeGoal = objectives.diario || objectives.semanal || objectives.mensual || objectives.anual;
    
    if (activeGoal) {
      const evaluation = this.evaluate(this._confidenceLevel);
      return `EVALUACIÓN DE REALIDAD (Reality Engine): El objetivo activo es "${activeGoal}". Estado: ${evaluation.message}`;
    }
    return '';
  }
}
