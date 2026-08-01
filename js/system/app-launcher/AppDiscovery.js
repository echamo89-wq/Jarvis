import AppScanner from './AppScanner.js';
import AppCatalog from './AppCatalog.js';
import { createLogger } from '../../utils/logger.js';

const _log = createLogger('APP_DISCOVERY');

export default class AppDiscovery {
  constructor() {
    this._scanner = new AppScanner();
    this._discoveryInProgress = false;
  }

  async discoverAll() {
    if (this._discoveryInProgress) {
      _log('warn', 'Discovery already in progress, skipping');
      return { cached: true, count: AppCatalog.count() };
    }
    this._discoveryInProgress = true;
    _log('info', 'Starting full app discovery...');

    try {
      const catalog = AppCatalog.getInstance();
      await catalog.load();

      const results = await Promise.allSettled([
        this._safeScan('registry', () => this._scanner.scanRegistry()),
        this._safeScan('startMenu', () => this._scanner.scanStartMenu()),
        this._safeScan('uwp', () => this._scanner.scanUwp()),
        this._safeScan('appPaths', () => this._scanner.scanAppPaths()),
      ]);

      let totalFound = 0;
      let added = 0;
      for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          totalFound += r.value.length;
          added += catalog.addMany(r.value);
        }
      }
      await catalog.save();

      _log('info', `Discovery complete: ${totalFound} apps found, ${added} added to catalog (${catalog.count()} total)`);
      return { cached: false, count: totalFound, added };
    } finally {
      this._discoveryInProgress = false;
    }
  }

  async discoverSources(sources) {
    const results = [];
    for (const src of sources) {
      const items = await this._safeScan(src, () => {
        switch (src) {
          case 'registry': return this._scanner.scanRegistry();
          case 'startMenu': return this._scanner.scanStartMenu();
          case 'uwp': return this._scanner.scanUwp();
          case 'appPaths': return this._scanner.scanAppPaths();
          default: return [];
        }
      });
      if (Array.isArray(items)) results.push(...items);
    }
    return results;
  }

  isRunning() {
    return this._discoveryInProgress;
  }

  invalidateScans() {
    this._scanner.invalidateCache();
  }

  async _safeScan(name, fn) {
    try {
      const result = await fn();
      _log('info', `Scan ${name}: ${Array.isArray(result) ? result.length : 0} items`);
      return result;
    } catch (err) {
      _log('warn', `Scan ${name} failed: ${err.message}`);
      return [];
    }
  }
}
