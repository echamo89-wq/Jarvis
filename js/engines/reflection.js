import { createLogger } from '../utils/logger.js';
const _log = createLogger('REFLECTION');

export class ReflectionEngine {
  constructor() {
    this._entries = [];
  }

  loadFromMemory(memory) {
    if (memory?.reflections) this._entries = memory.reflections;
  }

  toMemory() { return { reflections: this._entries }; }

  async nightlyReview() {
    const today = new Date().toISOString().slice(0, 10);
    const entry = {
      date: today,
      resultado: '',
      tiempoTrabajado: 0,
      aprendizajes: [],
      errores: [],
      mejoras: [],
      bloqueos: [],
      solicitudes: []
    };
    this._entries.push(entry);
    if (this._entries.length > 90) this._entries.shift();
    _log('info', 'Night review iniciada');
    return entry;
  }

  async weeklyReview() {
    const now = new Date();
    const weekNum = Math.ceil(now.getDate() / 7);
    const review = {
      week: `${now.getFullYear()}-W${weekNum}`,
      objetivos: [],
      tiempo: 0,
      aprendizaje: [],
      clientes: 0,
      ingresos: 0,
      habitos: [],
      estadoGeneral: 'estable'
    };
    _log('info', `Weekly review W${weekNum} lista`);
    return review;
  }

  getSummary() {
    const recent = this._entries.slice(-7);
    if (recent.length === 0) return 'Sin revisiones previas.';
    const errors = recent.flatMap(e => e.errores || []);
    const lessons = recent.flatMap(e => e.aprendizajes || []);
    return `Últimos ${recent.length} días: ${errors.length} errores, ${lessons.length} aprendizajes.`;
  }
}
