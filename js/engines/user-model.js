import { store } from '../state/store.js';
import { createLogger } from '../utils/logger.js';
const _log = createLogger('USER-MODEL');

export class UserModelEngine {
  constructor() {
    this._hypotheses = {};
    this._confidence = {};
  }

  loadFromMemory(userMemory) {
    if (!userMemory) return;
    this._data = {
      name: userMemory.userName || '',
      objectives: userMemory.objectives || [],
      skills: userMemory.skills || [],
      englishLevel: userMemory.englishLevel || 'unknown',
      energy: userMemory.energy || 'media',
      habits: userMemory.habits || [],
      projects: userMemory.projects || [],
      strengths: userMemory.strengths || [],
      weaknesses: userMemory.weaknesses || []
    };
    this._hypotheses = userMemory.hypotheses || {};
    this._confidence = userMemory.confidence || {};
  }

  toMemory() {
    return {
      ...this._data,
      hypotheses: this._hypotheses,
      confidence: this._confidence
    };
  }

  updateHypothesis(key, value, confidence) {
    this._hypotheses[key] = value;
    this._confidence[key] = Math.min(confidence, 100);
    _log('info', `Hipótesis: ${key} = ${value} (conf: ${confidence}%)`);
    this._persist();
  }

  getHypothesis(key) {
    return { value: this._hypotheses[key], confidence: this._confidence[key] || 0 };
  }

  getAllHypotheses() {
    return Object.entries(this._hypotheses).map(([k, v]) => ({
      key: k, value: v, confidence: this._confidence[k] || 0
    }));
  }

  getProfileSummary() {
    const parts = [];
    if (this._data?.name) parts.push(`Nombre: ${this._data.name}`);
    if (this._data?.objectives?.length) parts.push(`Objetivos: ${this._data.objectives.slice(0, 3).join(', ')}`);
    if (this._data?.energy) parts.push(`Energía: ${this._data.energy}`);
    if (this._data?.projects?.length) parts.push(`Proyectos: ${this._data.projects.length}`);
    return parts.join(' | ');
  }

  detectBottleneck() {
    const categories = [
      { key: 'falta_conocimiento', label: 'Falta de conocimiento', check: () => !this._data?.skills?.length },
      { key: 'falta_disciplina', label: 'Falta de disciplina', check: () => this._confidence['tiene_disciplina'] < 50 },
      { key: 'falta_descanso', label: 'Falta de descanso', check: () => this._data?.energy === 'muy_baja' },
      { key: 'sobrecarga', label: 'Sobrecarga de proyectos', check: () => (this._data?.projects?.length || 0) > 5 },
    ];
    for (const c of categories) {
      if (c.check()) return c;
    }
    return null;
  }

  _persist() {
    const memory = store.get('userMemory');
    if (memory) Object.assign(memory, this.toMemory());
    store.set('userMemory', { ...store.get('userMemory') });
  }
}
