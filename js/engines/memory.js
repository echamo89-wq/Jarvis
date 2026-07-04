import { store } from '../state/store.js';
import { createLogger } from '../utils/logger.js';
const _log = createLogger('MEMORY');

export class MemoryEngine {
  constructor() {
    this._stores = {
      identity: {},
      user: {},
      project: {},
      conversation: [],
      knowledge: {},
      preference: {},
      error: [],
      improvement: [],
      temporal: {}
    };
  }

  async load() {
    try {
      const raw = await window.electronAPI.memoryRead();
      if (raw) {
        if (raw.identityMemory) this._stores.identity = raw.identityMemory;
        if (raw.userMemory) this._stores.user = raw.userMemory;
        if (raw.projectMemory) this._stores.project = raw.projectMemory;
        if (raw.conversationMemory) this._stores.conversation = raw.conversationMemory;
        if (raw.knowledgeMemory) this._stores.knowledge = raw.knowledgeMemory;
        if (raw.preferenceMemory) this._stores.preference = raw.preferenceMemory;
        if (raw.errorMemory) this._stores.error = raw.errorMemory;
        if (raw.improvementMemory) this._stores.improvement = raw.improvementMemory;
        if (raw.temporalMemory) this._stores.temporal = raw.temporalMemory;
        _log('info', 'Memoria cargada desde disco');
      }
      return this._stores;
    } catch (e) {
      _log('warn', `Memoria: ${e.message}`);
      return this._stores;
    }
  }

  async persist() {
    try {
      await window.electronAPI.memoryWrite({
        identityMemory: this._stores.identity,
        userMemory: this._stores.user,
        projectMemory: this._stores.project,
        conversationMemory: this._stores.conversation,
        knowledgeMemory: this._stores.knowledge,
        preferenceMemory: this._stores.preference,
        errorMemory: this._stores.error,
        improvementMemory: this._stores.improvement,
        temporalMemory: this._stores.temporal
      });
    } catch (e) {
      _log('error', `Persist: ${e.message}`);
    }
  }

  get(store) { return this._stores[store]; }
  set(store, data) { this._stores[store] = data; this.persist(); }
  push(store, item) {
    if (!Array.isArray(this._stores[store])) this._stores[store] = [];
    this._stores[store].push(item);
    this.persist();
  }
  update(store, key, value) {
    if (!this._stores[store]) this._stores[store] = {};
    this._stores[store][key] = value;
    this.persist();
  }

  addConversationTurn(role, content) {
    this._stores.conversation.push({ role, content, timestamp: Date.now() });
    if (this._stores.conversation.length > 100) this._stores.conversation.shift();
    this.persist();
  }

  addError(source, message) {
    this._stores.error.push({ source, message, timestamp: Date.now() });
    if (this._stores.error.length > 50) this._stores.error.shift();
    this.persist();
  }

  addImprovementRequest(problem, frequency, impact, cause, proposal) {
    this._stores.improvement.push({
      problem, frequency, impact, cause, proposal,
      priority: Math.min(impact / (frequency || 1), 10),
      risk: 'media',
      timestamp: Date.now()
    });
    this.persist();
  }
}
