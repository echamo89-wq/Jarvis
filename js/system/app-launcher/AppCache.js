import { createLogger } from '../../utils/logger.js';

const _log = createLogger('APP_CACHE');
const CACHE_KEY = 'app_launcher_path_cache';
const CACHE_VERSION = 1;

export default class AppCache {
  constructor() {
    this._cache = new Map();
    this._stats = { hits: 0, misses: 0, sets: 0 };
    this._loaded = false;
  }

  get(key) {
    const entry = this._cache.get(key);
    if (entry) {
      if (entry.ttl && Date.now() > entry.ttl) {
        this._cache.delete(key);
        this._stats.misses++;
        return null;
      }
      this._stats.hits++;
      return entry.value;
    }
    this._stats.misses++;
    return null;
  }

  set(key, value, ttlMs = 0) {
    this._cache.set(key, {
      value,
      ttl: ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
    this._stats.sets++;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this._cache.delete(key);
  }

  clear() {
    this._cache.clear();
    this._stats = { hits: 0, misses: 0, sets: 0 };
  }

  get size() {
    return this._cache.size;
  }

  stats() {
    const { hits, misses, sets } = this._stats;
    const total = hits + misses;
    return { hits, misses, sets, size: this._cache.size, hitRate: total > 0 ? (hits / total * 100).toFixed(1) + '%' : '0%' };
  }

  toJSON() {
    const entries = [];
    for (const [key, entry] of this._cache) {
      entries.push({ key, value: entry.value, ttl: entry.ttl });
    }
    return { version: CACHE_VERSION, entries, stats: this._stats };
  }

  async load() {
    if (this._loaded) return;
    try {
      const raw = await window.electronAPI.memoryRead();
      const data = raw && raw[CACHE_KEY];
      if (data && data.version === CACHE_VERSION && Array.isArray(data.entries)) {
        for (const e of data.entries) {
          if (e.key !== undefined && e.value !== undefined) {
            this._cache.set(e.key, { value: e.value, ttl: e.ttl || 0 });
          }
        }
        if (data.stats) this._stats = { ...this._stats, ...data.stats };
        _log('info', `Cache loaded: ${this._cache.size} entries`);
      }
    } catch (e) {
      _log('warn', `Cache load failed: ${e.message}`);
    }
    this._loaded = true;
  }

  async save() {
    try {
      const raw = await window.electronAPI.memoryRead() || {};
      raw[CACHE_KEY] = this.toJSON();
      await window.electronAPI.memoryWrite(raw);
    } catch (e) {
      _log('warn', `Cache save failed: ${e.message}`);
    }
  }
}
