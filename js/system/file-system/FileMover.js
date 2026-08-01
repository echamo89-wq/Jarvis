import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('FILE_MOVER');

export async function moveFile(source, destination) {
  const start = Date.now();
  return await moveOrCopy(source, destination, 'move', start);
}

export async function copyFile(source, destination) {
  const start = Date.now();
  return await moveOrCopy(source, destination, 'copy', start);
}

async function moveOrCopy(source, destination, operation, start) {
  const srcPerm = await ensurePermittedWithDetails(source, 'read');
  if (!srcPerm.success) return Result.withDuration(srcPerm, start);

  const dstPerm = await ensurePermittedWithDetails(destination, 'write');
  if (!dstPerm.success) return Result.withDuration(dstPerm, start);

  try {
    const srcContent = await window.electronAPI.fileRead(srcPerm.path);
    if (!srcContent.success) {
      return Result.withDuration(Result.error(operation, 'READ_ERROR',
        `No se pudo leer el origen: ${srcContent.output}`, { source }), start);
    }

    const targetPath = dstPerm.path.endsWith('\\')
      ? dstPerm.path + source.split('\\').pop()
      : dstPerm.path;

    const wrote = await window.electronAPI.fileWrite(targetPath, srcContent.output);
    if (!wrote.success) {
      return Result.withDuration(Result.error(operation, 'WRITE_ERROR',
        `No se pudo escribir el destino: ${wrote.output}`, { destination: targetPath }), start);
    }

    if (operation === 'move') {
      const delResult = await window.electronAPI.fileDelete(srcPerm.path);
      if (!delResult.success) {
        return Result.withDuration(Result.error(operation, 'DELETE_ERROR',
          'Archivo copiado pero no se pudo eliminar el origen.', { source }), start);
      }
    }

    const verb = operation === 'move' ? 'Movido' : 'Copiado';
    return Result.withDuration(Result.success(operation, `${verb}: ${source} → ${targetPath}`, {
      operation,
      source: srcPerm.path,
      destination: targetPath,
      verified: true,
    }), start);
  } catch (e) {
    return Result.withDuration(Result.error(operation, 'MOVE_ERROR', e.message, { source, destination }), start);
  }
}
