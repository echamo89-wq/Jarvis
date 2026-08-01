import { createLogger } from '../../utils/logger.js';
import resolveApp from './AppResolver.js';
import AppCatalog from './AppCatalog.js';
import AppCache from './AppCache.js';
import AppDiscovery from './AppDiscovery.js';
import { launchWithFallback } from './LaunchStrategies.js';
import { AppVerifier } from './AppVerifier.js';
import { success, failure, launchResult, notFound } from './AppResult.js';
import { AppErrorCode } from './AppErrors.js';
import AppAliases from './AppAliases.js';

const _log = createLogger('APP_LAUNCHER');

let _catalogLoaded = false;
let _cacheLoaded = false;
const _pathCache = new AppCache();
const _verifier = new AppVerifier();
const _discovery = new AppDiscovery();

function _isUriPath(path) {
  if (!path || typeof path !== 'string') return false;
  return /^(https?|ms-|bingmaps|xbox|windowsdefender):/i.test(path);
}

function _buildMethods(entry) {
  const methods = [];
  const path = entry.path;
  const type = entry.type || 'executable';

  // start-process: método universal #1 (PATH, URIs, comandos del sistema, spawn directo)
  if (type === 'app_id' || entry.appId) {
    // UWP: shell:AppsFolder\AppID → openExternal nativo en un solo salto
    methods.push({ type: 'start_process', value: `shell:AppsFolder\\${entry.appId || path}`, priority: 100 });
  } else {
    methods.push({ type: 'start_process', value: path || entry.name, priority: 100 });
  }

  // Métodos específicos como respaldo (para PID tracking cuando funcionan)
  if (_isUriPath(path)) {
    methods.push({ type: 'uri', value: path, priority: 80 });
  } else if (type === 'uri') {
    methods.push({ type: 'uri', value: path, priority: 75 });
  } else if (type === 'executable' || type === 'shortcut') {
    methods.push({ type: type, path: path, priority: 70 });
  } else if (type === 'app_id' || entry.appId) {
    methods.push({ type: 'app_id', value: entry.appId || path, priority: 65 });
  } else if (type === 'shell_command') {
    methods.push({ type: 'shell_command', command: path, priority: 60 });
  }

  if (entry.alternateMethods) {
    for (const m of entry.alternateMethods) {
      methods.push({ ...m, priority: m.priority || 40 });
    }
  }

  return methods;
}

export async function ensureCatalog() {
  if (!_cacheLoaded) {
    await _pathCache.load();
    _cacheLoaded = true;
  }
  if (!_catalogLoaded) {
    const catalog = AppCatalog.getInstance();
    await catalog.load();
    _catalogLoaded = true;
    if (catalog.count() === 0) {
      _log('info', 'Catalog empty, running initial discovery...');
      const result = await _discovery.discoverAll();
      await catalog.save();
      _log('info', `Catalog populated: ${catalog.count()} apps`);
    }
  }
}

async function _saveCache() {
  try { await _pathCache.save(); } catch {}
}

async function _purgeCatalog(catalog) {
  let purged = 0;
  const all = catalog.getAll();

  // 1) Entradas-alias duplicadas del seed viejo (misma app, name != primary)
  for (const e of all) {
    if (e.source === 'known_apps' && e._primary && e.name !== e._primary) {
      if (catalog.removeByName(e.name, e.path)) purged++;
    }
  }

  // 2) Rutas rotas (executable/shortcut con ruta de archivo que ya no existe)
  const candidates = catalog.getAll().filter(e =>
    e.path && !e.path.startsWith('shell:') &&
    (e.type === 'executable' || e.type === 'shortcut') &&
    (e.path.includes('\\') || e.path.includes('/'))
  );
  const BATCH = 25;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(e =>
      window.electronAPI.fileInfo(e.path)
        .then(r => ({ e, ok: !!(r && r.success) }))
        .catch(() => ({ e, ok: false }))
    ));
    for (const r of results) {
      if (!r.ok && catalog.removeByName(r.e.name, r.e.path)) purged++;
    }
  }

  if (purged > 0) _log('info', `Purged ${purged} stale entries from catalog`);
  return purged;
}

export async function rebuildCatalog() {
  const catalog = AppCatalog.getInstance();
  catalog.invalidate();
  _catalogLoaded = false;
  _discovery.invalidateScans();
  const result = await _discovery.discoverAll();
  _catalogLoaded = true;
  await catalog.save();
  const purged = await _purgeCatalog(catalog);
  if (purged > 0) await catalog.save();
  _log('info', `Catalog rebuilt: ${catalog.count()} apps`);
  return { total: catalog.count(), added: result.added || 0, purged };
}

export async function launchApp(query, options = {}) {
  const startTime = Date.now();
  const { allowDiscovery = false } = options;

  let q = query;
  if (typeof query === 'object' && query.query) {
    q = query.query;
  }

  if (!q || typeof q !== 'string') {
    return failure(AppErrorCode.INVALID_INPUT, { query: q });
  }

  // 1. Ensure catalog is ready (catálogo = única fuente de verdad)
  if (!_catalogLoaded) {
    await ensureCatalog();
  }

  // 2. Resolve using resolver
  const resolved = await resolveApp(q);
  if (!resolved) {
    // 3. Fallback: path cache (solo rutas usables guardadas en sesiones previas)
    const cachedPath = _pathCache.get(q.trim().toLowerCase());
    if (cachedPath && (cachedPath.includes('\\') || cachedPath.includes('/') || cachedPath.startsWith('shell:') || _isUriPath(cachedPath))) {
      const attempt = await launchWithFallback([{ type: 'executable', path: cachedPath, priority: 100 }]);
      const result = launchResult({ name: q, path: cachedPath, _resolvedBy: 'path_cache' }, attempt);
      if (attempt.success) {
        result.verificationId = _verifier.schedule(result, cachedPath, attempt.pid);
      }
      result.durationMs = Date.now() - startTime;
      return result;
    }
    if (allowDiscovery) {
      _log('info', `Not found, running discovery for: ${q}`);
      await _discovery.discoverAll();
      const retry = await resolveApp(q);
      if (retry) {
        return _doLaunch(retry, startTime);
      }
    }
    return notFound(q);
  }

  return _doLaunch(resolved, startTime);
}

async function _doLaunch(resolved, startTime) {
  const methods = _buildMethods(resolved);

  if (methods.length === 0) {
    _log('warn', `No launch methods for: ${resolved.name}`);
    return failure(AppErrorCode.NO_METHOD, { app: resolved.name });
  }

  const attempt = await launchWithFallback(methods);
  const result = launchResult(resolved, attempt);

  if (attempt.success) {
    const target = attempt.path || resolved.name;
    if (target) {
      const skipVerify = ['uri', 'shell_command', 'app_id'].includes(attempt.method);
      if (!skipVerify) {
        result.verificationId = _verifier.schedule(result, target, attempt.pid);
      } else {
        result.verificationStatus = 'skipped';
      }
      _pathCache.set(resolved._query?.toLowerCase() || resolved.name.toLowerCase(), target);
      if (attempt.path) _pathCache.set(attempt.path.toLowerCase(), attempt.path);
    }
  }

  result.durationMs = Date.now() - startTime;
  _saveCache();
  return result;
}

export function getVerificationStatus(id) {
  return _verifier.getStatus(id);
}

export function getCatalogStats() {
  const catalog = AppCatalog.getInstance();
  return {
    entries: catalog.count(),
    loaded: _catalogLoaded,
    cacheStats: _pathCache.stats(),
  };
}

export function getAliases() {
  return AppAliases.getAllEntries();
}

export async function seedCatalogFromKnownApps(knownApps) {
  let seeded = 0;
  try {
    const catalog = AppCatalog.getInstance();
    await catalog.load();

    // Purga entradas-alias del seed viejo (misma app, name != primary): el nuevo seed
    // crea una sola entrada por app con _aliases, así que estas son redundantes.
    let purged = 0;
    for (const e of catalog.getAll()) {
      if (e.source === 'known_apps' && e._primary && e.name !== e._primary) {
        if (catalog.removeByName(e.name, e.path)) purged++;
      }
    }
    if (purged > 0) _log('info', `Purged ${purged} duplicate alias entries`);

    const aliasEntries = AppAliases.getAllEntries();
    for (const a of aliasEntries) {
      if (catalog.add({ name: a.name, path: a.path, type: a.type, source: 'alias', _aliases: a._aliases })) seeded++;
    }
    if (knownApps && typeof knownApps === 'object') {
      for (const app of Object.values(knownApps)) {
        const type = app.url && !app.exe ? 'uri' : 'executable';
        const path = app.exe || app.url;
        const names = app.names || [];
        const primaryName = names[0] || app.exe?.replace('.exe', '') || 'unknown';
        const categories = [app.category, ...app.altCategories || []];
        if (!primaryName || typeof primaryName !== 'string') continue;
        // Una sola entrada por app: los aliases se guardan como nombres alternativos
        const entry = { name: primaryName, path, type, source: 'known_apps', category: app.category, _primary: primaryName, _aliases: names, _categories: categories };
        if (catalog.add(entry)) seeded++;
      }
    }
    await catalog.save();
    _log('info', `Catalog seeded: ${catalog.count()} total (${seeded} new)`);

    // Purga de rutas rotas: apps desinstaladas se limpian del catálogo en cada seed
    const stale = await _purgeCatalog(catalog);
    if (stale > 0) {
      await catalog.save();
      _log('info', `Purged ${stale} uninstalled apps from catalog`);
    }
  } catch (e) {
    _log('error', `seedCatalogFromKnownApps failed: ${e.message}`);
  }
  return seeded;
}

export { AppVerifier, AppCache, AppDiscovery, _pathCache };
