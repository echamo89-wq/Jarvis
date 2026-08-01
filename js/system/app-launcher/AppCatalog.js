import { createLogger } from '../../utils/logger.js';
const _log = createLogger('APP_CATALOG');

const CATALOG_VERSION = 2;
const STORAGE_KEY = 'app_catalog';
const MAX_ENTRIES = 5000;

let _instance = null;

export default class AppCatalog {
  constructor() {
    if (_instance) return _instance;
    this._entries = [];
    this._nameIndex = new Map();
    this._pathIndex = new Map();
    this._loaded = false;
    this._loadError = null;
    this._version = CATALOG_VERSION;
    _instance = this;
  }

  static getInstance() {
    if (!_instance) new AppCatalog();
    return _instance;
  }

  async load() {
    if (this._loaded) return true;
    try {
      const raw = await window.electronAPI.memoryRead();
      if (!raw || typeof raw !== 'object') {
        _log('warn', 'Memory read returned invalid data, starting fresh catalog');
        this._loaded = true;
        return true;
      }
      const data = raw[STORAGE_KEY];
      if (!data || !Array.isArray(data.entries)) {
        _log('info', 'No catalog data found in memory, starting fresh');
        this._loaded = true;
        return true;
      }
      if (data._version !== CATALOG_VERSION) {
        _log('info', `Catalog version mismatch (disk: ${data._version}, app: ${CATALOG_VERSION}), rebuilding`);
        this._loaded = true;
        return true;
      }
      if (data.entries.length > MAX_ENTRIES) {
        _log('warn', `Catalog has ${data.entries.length} entries (max ${MAX_ENTRIES}), truncating`);
        data.entries = data.entries.slice(0, MAX_ENTRIES);
      }
      const valid = data.entries.filter(e => e && e.name);
      if (valid.length < data.entries.length) {
        _log('warn', `Filtered ${data.entries.length - valid.length} invalid entries from catalog`);
      }
      this._entries = valid;
      this._version = data._version || CATALOG_VERSION;
      this._rebuildIndex();
      _log('info', `Catalog loaded: ${this._entries.length} entries (v${this._version})`);
    } catch (e) {
      this._loadError = e.message;
      _log('error', `Catalog load failed: ${e.message}`);
    }
    this._loaded = true;
    return true;
  }

  async save() {
    try {
      const raw = await window.electronAPI.memoryRead();
      if (!raw || typeof raw !== 'object') {
        _log('warn', 'Cannot save catalog: memoryRead returned invalid data, will retry on next save');
        return false;
      }
      raw[STORAGE_KEY] = this._serialize();
      await window.electronAPI.memoryWrite(raw);
      return true;
    } catch (e) {
      _log('error', `Catalog save failed: ${e.message}`);
      return false;
    }
  }

  add(entry) {
    if (!entry || !entry.name) return false;
    const normalized = entry.name.trim().toLowerCase();
    const existingIdx = this._entries.findIndex(e => e.name.toLowerCase() === normalized && e.path === entry.path);
    if (existingIdx >= 0) {
      this._entries[existingIdx] = { ...this._entries[existingIdx], ...entry, _updatedAt: Date.now() };
    } else {
      const sameNameIdx = this._entries.findIndex(e => e.name.toLowerCase() === normalized);
      if (sameNameIdx >= 0) {
        const existing = this._entries[sameNameIdx];
        const isFullPath = (p) => typeof p === 'string' && (p.includes('\\') || p.includes('/') || p.startsWith('shell:'));
        const upgrade = (!existing.path && entry.path) ||
          (existing.path && entry.path && !isFullPath(existing.path) && isFullPath(entry.path));
        if (upgrade) {
          // upgrade: entrada stale (sin ruta o con nombre pelado) reemplazada por una con ruta real
          this._entries[sameNameIdx] = { ...existing, ...entry, _updatedAt: Date.now() };
        } else {
          this._entries.push({ ...entry, _addedAt: Date.now(), _updatedAt: Date.now() });
        }
      } else {
        this._entries.push({ ...entry, _addedAt: Date.now(), _updatedAt: Date.now() });
      }
    }
    this._rebuildIndex();
    return true;
  }

  addMany(entries) {
    let count = 0;
    for (const e of entries) {
      if (this.add(e)) count++;
    }
    return count;
  }

  removeByName(name, path) {
    const idx = this._entries.findIndex(e =>
      e.name.toLowerCase() === String(name).toLowerCase() && e.path === path
    );
    if (idx >= 0) {
      this._entries.splice(idx, 1);
      this._rebuildIndex();
      return true;
    }
    return false;
  }

  findByName(query) {
    const q = query.trim().toLowerCase();
    const direct = this._nameIndex.get(q);
    if (direct) return direct;
    for (const [key, entry] of this._nameIndex) {
      if (key.includes(q) || q.includes(key)) return entry;
    }
    return null;
  }

  findByPath(path) {
    if (!path) return null;
    return this._pathIndex.get(path.toLowerCase().replace(/\\/g, '/')) || null;
  }

  search(query) {
    const q = query.trim().toLowerCase();
    const results = [];
    for (const entry of this._entries) {
      const name = entry.name.toLowerCase();
      if (name === q) results.unshift(entry);
      else if (name.includes(q)) results.push(entry);
    }
    return results;
  }

  getAll() {
    return [...this._entries];
  }

  count() {
    return this._entries.length;
  }

  invalidate() {
    this._loaded = false;
    this._loadError = null;
    this._entries = [];
    this._rebuildIndex();
  }

  isLoaded() {
    return this._loaded;
  }

  getLastError() {
    return this._loadError;
  }

  _rebuildIndex() {
    this._nameIndex.clear();
    this._pathIndex.clear();
    for (const entry of this._entries) {
      const key = entry.name.trim().toLowerCase();
      if (!this._nameIndex.has(key)) this._nameIndex.set(key, entry);
      if (entry.path) {
        const pkey = entry.path.toLowerCase().replace(/\\/g, '/');
        if (!this._pathIndex.has(pkey)) this._pathIndex.set(pkey, entry);
      }
    }
  }

  _serialize() {
    return {
      _version: CATALOG_VERSION,
      _savedAt: Date.now(),
      entries: this._entries,
    };
  }
}
