/**
 * adapter-file-system.js
 *
 * Capa de compatibilidad entre los handlers existentes y el nuevo
 * sistema de archivos modular (js/system/file-system/).
 *
 * Cada función tiene la misma signature que el handler antiguo para
 * que la migración sea transparente.
 */

import { resolvePath } from '../../system/file-system/PathResolver.js';
import { ensurePermitted, consumePermission } from '../../system/file-system/FilePermissionManager.js';
import { readFile, readFilePreview } from '../../system/file-system/FileReader.js';
import { writeFile, appendFile } from '../../system/file-system/FileWriter.js';
import { searchFiles } from '../../system/file-system/FileSearcher.js';
import { moveFile, copyFile } from '../../system/file-system/FileMover.js';
import { deleteFile, deleteFolder } from '../../system/file-system/FileDeleter.js';
import { inspectPath } from '../../system/file-system/FileInspector.js';
import { processDocument } from '../../system/file-system/DocumentProcessor.js';
import { findMedia } from '../../system/file-system/MediaFinder.js';
import * as Organizer from '../../system/file-system/FolderOrganizer.js';
import * as Result from '../../system/file-system/FileResult.js';
import { execute } from '../../system/file-system/FileToolRouter.js';

export {
  resolvePath, ensurePermitted, consumePermission,
  readFile, readFilePreview, writeFile, appendFile,
  searchFiles, moveFile, copyFile, deleteFile, deleteFolder,
  inspectPath, processDocument, findMedia, Organizer,
  Result, execute,
};

// Helper para convertir resultado del nuevo sistema a formato legacy
export function toLegacyResult(newResult) {
  if (!newResult) return { success: false, output: 'Error desconocido' };
  if (newResult.success) {
    return { success: true, output: newResult.message };
  }
  return { success: false, output: newResult.message || 'Error' };
}

// Helper para convertir resultado del nuevo sistema manteniendo datos extra
export function toLegacyWithData(newResult) {
  if (!newResult) return { success: false, output: 'Error desconocido' };
  return {
    success: newResult.success,
    output: newResult.message || (newResult.success ? 'OK' : 'Error'),
    data: newResult.data || null,
  };
}
