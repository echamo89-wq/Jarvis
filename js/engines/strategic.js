export class StrategicEngine {
  constructor() {
    this._objectives = {};
  }

  loadFromMemory(memory) {
    if (memory?.objectives) this._objectives = memory.objectives;
  }

  setObjective(level, text) {
    this._objectives[level] = text;
  }

  getPriorityChain() {
    return [
      { key: 'anual', label: 'Anual', objective: this._objectives.anual },
      { key: 'trimestral', label: 'Trimestral', objective: this._objectives.trimestral },
      { key: 'mensual', label: 'Mensual', objective: this._objectives.mensual },
      { key: 'semanal', label: 'Semanal', objective: this._objectives.semanal },
      { key: 'diario', label: 'Diario', objective: this._objectives.diario }
    ].filter(p => p.objective);
  }

  topPriority() {
    const chain = this.getPriorityChain();
    return chain[0] || null;
  }

  evaluateResponse(text) {
    const categories = ['claridad', 'ejecución', 'aprendizaje', 'consistencia', 'tiempo', 'ingresos', 'salud', 'organización'];
    const matched = categories.filter(c => text.toLowerCase().includes(c));
    return {
      addsValue: matched.length > 0,
      categories: matched,
      score: matched.length / categories.length
    };
  }
}
