import { createLogger } from '../../utils/logger.js';
const _log = createLogger('APP_VERIFIER');

const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 8000;

export class AppVerifier {
  constructor() {
    this._pending = new Map();
  }

  schedule(launchResult, appPathOrName, pid) {
    const id = this._generateId();
    const entry = {
      id,
      launchResult,
      target: appPathOrName,
      pid: pid || null,
      scheduledAt: Date.now(),
      done: false,
      confirmed: false,
    };
    this._pending.set(id, entry);
    this._runAsync(entry);
    return id;
  }

  getStatus(id) {
    const entry = this._pending.get(id);
    if (!entry) return null;
    if (entry.done) {
      return { done: true, confirmed: entry.confirmed };
    }
    return { done: false, confirmed: false, elapsed: Date.now() - entry.scheduledAt };
  }

  _generateId() {
    return `vfy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async _runAsync(entry) {
    try {
      const confirmed = await this._pollProcess(entry);
      entry.done = true;
      entry.confirmed = confirmed;
      _log('info', `Verification ${confirmed ? 'confirmed' : 'failed'}: ${entry.target}${entry.pid ? ` (pid:${entry.pid})` : ''}`);
    } catch (err) {
      _log('error', `Verification error: ${err.message}`);
      entry.done = true;
      entry.confirmed = false;
    }
  }

  async _pollProcess(entry) {
    const deadline = Date.now() + MAX_WAIT_MS;
    await this._sleep(POLL_INTERVAL_MS);

    while (Date.now() < deadline) {
      const running = await this._checkOnce(entry);
      if (running) return true;
      await this._sleep(POLL_INTERVAL_MS);
    }
    return false;
  }

  async _checkOnce(entry) {
    try {
      if (!entry.pid && entry.target.includes(':') && !entry.target.includes('\\') && !entry.target.includes('/')) return true; // lanzamiento por URI: sin proceso que verificar
      const opts = {};
      if (entry.pid) opts.pid = entry.pid;
      else {
        const name = entry.target.split(/[\\/]/).pop() || entry.target;
        opts.name = name;
      }
      const result = await window.electronAPI.checkProcess(opts);
      return result && result.running === true;
    } catch {
      return false;
    }
  }

  async _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
