import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import { isTextExtension } from './PathValidator.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('FILE_SEARCHER');

const DEFAULT_ROOTS = ['Documents', 'Downloads', 'Desktop'];

export async function searchFiles(params) {
  const start = Date.now();
  const query = (params.query || params.pattern || '').trim();
  const roots = params.roots || DEFAULT_ROOTS;
  const mode = params.searchMode || params.mode || 'name';
  const maxResults = Math.min(params.maxResults || 30, 100);

  if (!query && mode !== 'extension') {
    return Result.withDuration(Result.error('search', 'PATH_EMPTY', 'No se especificó qué buscar.', {}), start);
  }

  const home = (await import('../../state/store.js')).store.get('homeDir') || 'C:\\Users\\Admin';

  let allResults = [];

  for (const root of roots) {
    const resolvedPath = root.includes(':') ? root : `${home}\\${root}`;
    const perm = await ensurePermittedWithDetails(resolvedPath, 'find');
    if (!perm.success) continue;

    if (mode === 'content') {
      const contentResults = await searchContent(resolvedPath, query, maxResults);
      allResults.push(...contentResults);
    } else if (mode === 'extension') {
      const pattern = query.startsWith('.') ? `*${query}` : `*.${query}`;
      const r = await window.electronAPI.fileFind(perm.path, pattern, maxResults);
      if (r.success) {
        const files = (r.output || '').split('\n').filter(Boolean);
        allResults.push(...files.map(f => ({ file: f, method: 'extension' })));
      }
    } else if (mode === 'folder') {
      const r = await window.electronAPI.fileFind(perm.path, query || '*', maxResults);
      if (r.success) {
        const lines = (r.output || '').split('\n').filter(l => l.includes('[DIR]'));
        allResults.push(...lines.map(l => ({ file: l.replace('[DIR] ', '').trim(), method: 'folder' })));
      }
    } else if (mode === 'media') {
      const mediaType = params.mediaType || 'all';
      const r = await window.electronAPI.fileMediaFind(perm.path, mediaType, maxResults);
      if (r.success) {
        const files = (r.output || '').split('\n').filter(Boolean);
        allResults.push(...files.map(f => ({ file: f, method: 'media' })));
      }
    } else {
      const r = await window.electronAPI.fileFind(perm.path, `*${query}*`, maxResults);
      if (r.success) {
        const files = (r.output || '').split('\n').filter(Boolean);
        allResults.push(...files.map(f => ({ file: f, method: 'name' })));
      }
    }

    if (allResults.length >= maxResults) break;
  }

  allResults = allResults.slice(0, maxResults);

  if (allResults.length === 0) {
    return Result.withDuration(Result.success('search', `No encontré nada "${query}" en las carpetas especificadas.`, {
      results: [],
      totalResults: 0,
      query,
    }), start);
  }

  return Result.withDuration(Result.success('search', `Se encontraron ${allResults.length} resultado(s).`, {
    results: allResults,
    totalResults: allResults.length,
    query,
  }), start);
}

async function searchContent(rootPath, query, maxResults) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (keywords.length === 0) return [];

  const r = await window.electronAPI.fileFind(rootPath, '*.*', 100);
  if (!r.success) return [];

  const filePaths = (r.output || '').split('\n').filter(l => l.trim());
  const results = [];

  for (const fp of filePaths) {
    const ext = fp.includes('.') ? fp.split('.').pop().toLowerCase() : '';
    if (!isTextExtension(ext)) continue;
    if (results.length >= maxResults) break;

    try {
      const content = await window.electronAPI.fileRead(fp);
      if (!content.success) continue;
      const lower = content.output.toLowerCase();
      if (keywords.every(kw => lower.includes(kw))) {
        const lines = content.output.split('\n');
        const matchIdx = lines.findIndex(l => keywords.some(kw => l.toLowerCase().includes(kw)));
        const ctxLines = lines.slice(Math.max(0, matchIdx - 1), Math.min(lines.length, matchIdx + 4));
        const snippet = ctxLines.join('\n').replace(/[\r\n]+/g, ' ').trim().substring(0, 300);
        results.push({ file: fp, snippet, method: 'content' });
      }
    } catch {}
  }

  return results;
}
