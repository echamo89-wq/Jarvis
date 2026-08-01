import { ensurePermittedWithDetails, consumePermission } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('FILE_DELETER');

export async function deleteFile(path) {
  const start = Date.now();

  const perm = await ensurePermittedWithDetails(path, 'delete');
  if (!perm.success) return Result.withDuration(perm, start);

  try {
    const r = await window.electronAPI.fileDelete(perm.path);
    if (perm.once) consumePermission(path);
    if (!r.success) {
      return Result.withDuration(Result.error('delete', 'DELETE_ERROR',
        r.output || 'No se pudo eliminar.', { path }), start);
    }
    return Result.withDuration(Result.success('delete', 'Archivo eliminado.', {
      path: perm.path,
      permanent: false,
      verified: true,
    }), start);
  } catch (e) {
    return Result.withDuration(Result.error('delete', 'DELETE_ERROR', e.message, { path }), start);
  }
}

export async function deleteFolder(path) {
  const start = Date.now();

  const perm = await ensurePermittedWithDetails(path, 'delete_folder');
  if (!perm.success) return Result.withDuration(perm, start);

  try {
    const r = await window.electronAPI.fileDeleteFolder(perm.path);
    if (perm.once) consumePermission(path);
    if (!r.success) {
      return Result.withDuration(Result.error('delete_folder', 'DELETE_ERROR',
        r.output || 'No se pudo eliminar la carpeta.', { path }), start);
    }
    return Result.withDuration(Result.success('delete_folder', 'Carpeta eliminada.', {
      path: perm.path,
      verified: true,
    }), start);
  } catch (e) {
    return Result.withDuration(Result.error('delete_folder', 'DELETE_ERROR', e.message, { path }), start);
  }
}
