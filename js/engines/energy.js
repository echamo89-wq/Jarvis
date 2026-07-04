export class EnergyEngine {
  constructor() {
    this._level = 'media';
    this._levels = ['muy_alta', 'alta', 'media', 'baja', 'muy_baja'];
  }

  loadFromMemory(memory) {
    if (memory?.energy) this._level = memory.energy;
  }

  toMemory() { return { energy: this._level }; }

  set(level) {
    if (this._levels.includes(level)) {
      this._level = level;
      return true;
    }
    return false;
  }

  get() { return this._level; }

  canDeepWork() {
    return this._level === 'muy_alta' || this._level === 'alta';
  }

  recommendedTaskType() {
    const map = {
      'muy_alta': 'trabajo_profundo',
      'alta': 'trabajo_analitico',
      'media': 'tareas_operativas',
      'baja': 'revision_administrativa',
      'muy_baja': 'descanso'
    };
    return map[this._level] || 'tareas_operativas';
  }

  getProfileBlock() {
    const labels = {
      'muy_alta': '⚡ Rendimiento óptimo',
      'alta': '● Buena energía',
      'media': '◐ Ritmo normal',
      'baja': '○ Energía baja',
      'muy_baja': '⊙ Descanso necesario'
    };
    return `NIVEL DE ENERGÍA: ${labels[this._level] || '◐ Ritmo normal'}. Tipo de trabajo recomendado: ${this.recommendedTaskType()}.`;
  }
}
