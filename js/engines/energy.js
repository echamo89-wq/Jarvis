export class EnergyEngine {
  constructor() {
    this._levels = ['muy_alta', 'alta', 'media', 'baja', 'muy_baja'];
    this._level = this._detectLevelByTime();
  }

  _detectLevelByTime() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'alta';
    if (hour >= 12 && hour < 18) return 'media';
    if (hour >= 18 && hour < 23) return 'baja';
    return 'muy_baja';
  }

  loadFromMemory(memory) {
    if (memory?.energy) {
      this._level = memory.energy;
    } else {
      this._level = this._detectLevelByTime();
    }
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
