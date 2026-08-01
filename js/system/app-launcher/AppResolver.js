import AppAliases from './AppAliases.js';
import AppCatalog from './AppCatalog.js';
import { normalizeInput } from './AppNormalizer.js';
import { createLogger } from '../../utils/logger.js';

const _log = createLogger('APP_RESOLVER');

function _norm(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calidad de la ruta de una entrada (para penalizar rutas peladas y favorecer las verificadas)
function _pathPenalty(entry) {
  const p = entry.path;
  if (!p || typeof p !== 'string') return -40;
  if (p.startsWith('shell:') || (entry.type === 'app_id' && entry.appId)) return 0;
  if (p.includes('\\')) return 0;
  if (/^ms-/.test(p)) return -5;
  if (/^https?:/i.test(p)) return -10;
  return -40; // nombre pelado (chrome.exe, obs64.exe...) — no gana sobre rutas reales
}

function _pathRank(entry) {
  const p = entry.path;
  if (!p || typeof p !== 'string') return 0;
  if (p.startsWith('shell:')) return 3;
  if (p.includes('\\') || p.includes('/')) return 2;
  if (/^ms-/.test(p)) return 2;
  if (/^https?:/i.test(p)) return 1;
  return 0;
}

function _matchScore(query, target) {
  if (!target) return 0;
  const q = _norm(query);
  const t = _norm(target);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (q.length >= 4 && (t.startsWith(q) || q.startsWith(t))) return 85;
  if (t.includes(q) || q.includes(t)) return 65;
  return 0;
}

function _scoreEntry(entry, q) {
  let score = _matchScore(q, entry.name);
  let matched = score >= 65 ? entry.name : null;
  if (Array.isArray(entry._aliases)) {
    for (const a of entry._aliases) {
      const s = _matchScore(q, a);
      if (s > score) { score = s; matched = a; }
    }
  }
  return { score, matched };
}

function _finalize(entry, raw, resolvedBy, matchedName) {
  const e = { ...entry };
  e._resolvedBy = resolvedBy;
  e._query = raw;
  if (matchedName) e._matchedName = matchedName;
  return e;
}

export default async function resolveApp(query) {
  const raw = query;
  const q = normalizeInput(query);
  if (!q) return null;

  const catalog = AppCatalog.getInstance();
  const allEntries = catalog.getAll();

  // Un solo ranking: score de nombre + penalización por calidad de ruta
  let best = null;
  for (const entry of allEntries) {
    const { score: match, matched } = _scoreEntry(entry, q);
    if (match < 65) continue;
    const score = match + _pathPenalty(entry);
    if (score < 65) continue;
    if (!best ||
        score > best.score ||
        (score === best.score && _pathRank(entry) > _pathRank(best.entry))) {
      best = { entry, score, match, matched };
    }
  }

  if (best) {
    const by = best.match === 100
      ? 'catalog_exact'
      : best.match >= 85 ? 'catalog_prefix' : 'catalog_fuzzy';
    return _finalize(best.entry, raw, by, best.matched);
  }

  // Triggers de AppAliases como nombres alternativos
  const aliasMatch = AppAliases.resolve(q);
  if (aliasMatch) {
    const catEntry = catalog.findByName(aliasMatch.name.toLowerCase());
    if (catEntry && _pathPenalty(catEntry) > -30) {
      return _finalize(catEntry, raw, 'alias_enhanced', aliasMatch.name);
    }
    return _finalize(aliasMatch, raw, 'alias', aliasMatch.name);
  }

  _log('info', `Not found: ${q}`);
  return null;
}
