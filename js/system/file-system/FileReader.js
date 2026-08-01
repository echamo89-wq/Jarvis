import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import { isTextExtension, isDocumentExtension } from './PathValidator.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('FILE_READER');

const MAX_TEXT_SIZE = 10 * 1024 * 1024;
const MAX_PREVIEW_LINES = 500;

export async function readFile(path, options) {
  const start = Date.now();
  const opts = options || {};
  const maxSize = opts.maxSize || MAX_TEXT_SIZE;

  const perm = await ensurePermittedWithDetails(path, 'read');
  if (!perm.success) return Result.withDuration(perm, start);

  const resolved = resolvePath(path);
  if (!resolved.success) {
    return Result.withDuration(Result.pathNotFound('read', path), start);
  }

  try {
    const r = await window.electronAPI.fileRead(resolved.resolvedPath);
    if (!r.success) {
      return Result.withDuration(Result.error('read', 'READ_ERROR', r.output || 'No se pudo leer el archivo.', { path }), start);
    }

    const content = r.output || '';
    const totalBytes = content.length * 2;
    const truncated = totalBytes > maxSize;

    const ext = resolved.resolvedPath.includes('.')
      ? resolved.resolvedPath.split('.').pop().toLowerCase() : '';

    return Result.withDuration(Result.success('read', 'Archivo leído correctamente.', {
      file: {
        path: resolved.resolvedPath,
        name: resolved.resolvedPath.split('\\').pop(),
        extension: ext,
        sizeBytes: totalBytes,
      },
      content: truncated ? content.substring(0, maxSize) : content,
      truncated,
      totalSizeBytes: totalBytes,
      reason: truncated ? 'SIZE_LIMIT' : null,
    }), start);
  } catch (e) {
    return Result.withDuration(Result.error('read', 'READ_ERROR', e.message, { path }), start);
  }
}

export async function readFilePreview(path, maxLines) {
  const result = await readFile(path, { maxSize: 500000 });
  if (!result.success) return result;

  const lines = (result.data.content || '').split('\n');
  const limit = maxLines || MAX_PREVIEW_LINES;

  if (lines.length > limit) {
    result.data.content = lines.slice(0, limit).join('\n');
    result.data.truncated = true;
    result.data.reason = 'LINE_LIMIT';
  }

  return result;
}
