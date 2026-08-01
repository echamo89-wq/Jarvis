import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('MEDIA_FINDER');

const MEDIA_TYPES = {
  all: 'all',
  image: 'image',
  video: 'video',
  audio: 'audio',
};

export async function findMedia(params) {
  const start = Date.now();
  const path = params.path || '';
  const mediaType = MEDIA_TYPES[params.mediaType || 'all'] || 'all';
  const maxResults = Math.min(params.maxResults || 30, 100);

  if (!path) {
    return Result.withDuration(Result.error('media_find', 'PATH_EMPTY', 'No se especificó la carpeta donde buscar.', {}), start);
  }

  const resolved = resolvePath(path);
  if (!resolved.success) {
    return Result.withDuration(Result.pathNotFound('media_find', path), start);
  }

  const perm = await ensurePermittedWithDetails(resolved.resolvedPath, 'find');
  if (!perm.success) return Result.withDuration(perm, start);

  try {
    const r = await window.electronAPI.fileMediaFind(perm.path, mediaType, maxResults);
    if (!r.success) {
      return Result.withDuration(Result.error('media_find', 'SEARCH_ERROR',
        r.output || 'Error al buscar multimedia.', { path }), start);
    }

    const files = (r.output || '').split('\n').filter(Boolean);
    if (files.length === 0) {
      return Result.withDuration(Result.success('media_find',
        `No encontré archivos multimedia en "${path}".`, {
          results: [], totalResults: 0,
        }), start);
    }

    const typeLabel = mediaType === 'all' ? 'multimedia' : mediaType;
    return Result.withDuration(Result.success('media_find',
      `Encontré ${files.length} archivo(s) de ${typeLabel}.`, {
        results: files,
        totalResults: files.length,
        mediaType,
      }), start);
  } catch (e) {
    return Result.withDuration(Result.error('media_find', 'SEARCH_ERROR', e.message, { path }), start);
  }
}
