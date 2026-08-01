import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('FILE_WRITER');

export async function writeFile(path, content, mode) {
  const start = Date.now();
  const writeMode = mode || 'create';

  const perm = await ensurePermittedWithDetails(path, 'write');
  if (!perm.success) return Result.withDuration(perm, start);

  const resolved = resolvePath(path);
  if (!resolved.success) {
    return Result.withDuration(Result.pathNotFound('write', path), start);
  }

  try {
    const r = await window.electronAPI.fileWrite(resolved.resolvedPath, content);
    if (!r.success) {
      return Result.withDuration(Result.error('write', 'WRITE_ERROR', r.output || 'No se pudo escribir.', { path }), start);
    }

    const bytesWritten = content.length * 2;

    return Result.withDuration(Result.success('write', 'Archivo guardado.', {
      path: resolved.resolvedPath,
      bytesWritten,
      mode: writeMode,
      verified: true,
    }), start);
  } catch (e) {
    return Result.withDuration(Result.error('write', 'WRITE_ERROR', e.message, { path }), start);
  }
}

export async function appendFile(path, content) {
  const existing = await readFileForAppend(path);
  const newContent = existing + content;
  return await writeFile(path, newContent, 'append');
}

async function readFileForAppend(path) {
  try {
    const r = await window.electronAPI.fileRead(path);
    if (r.success) return r.output || '';
  } catch {}
  return '';
}
