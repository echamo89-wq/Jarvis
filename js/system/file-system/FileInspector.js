import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import { getFileDescription, getCategory, getCategoryEmoji, isTextExtension } from './PathValidator.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('FILE_INSPECTOR');

export async function inspectPath(path, options) {
  const start = Date.now();
  const opts = options || {};
  const deep = opts.deep === true;

  const resolved = resolvePath(path);
  if (!resolved.success) {
    return Result.withDuration(Result.pathNotFound('inspect', path), start);
  }

  const perm = await ensurePermittedWithDetails(resolved.resolvedPath, 'list');
  if (!perm.success) return Result.withDuration(perm, start);

  const targetPath = perm.path;
  const name = targetPath.split('\\').pop() || targetPath;

  // Try as directory first
  const listRes = await window.electronAPI.fileList(targetPath);
  if (listRes.success) {
    return await inspectFolder(targetPath, name, path, listRes, deep, start);
  }

  // Try as file
  const infoRes = await window.electronAPI.fileInfo(targetPath);
  if (infoRes.success) {
    return await inspectFile(targetPath, name, infoRes, start);
  }

  return Result.withDuration(Result.error('inspect', 'PATH_NOT_FOUND',
    `No encontré "${path}". Verificá que la ruta exista.`, { path }), start);
}

export async function inspectFolder(folderPath, displayName, originalPath, listResult, deep, start) {
  const rawLines = (listResult.output || '').split('\n').map(l => l.trim()).filter(Boolean);

  if (rawLines.length === 0 || listResult.output === '(vacío)') {
    return Result.withDuration(Result.success('inspect', `La carpeta "${displayName}" está vacía.`, {
      type: 'directory',
      path: folderPath,
      summary: { files: 0, folders: 0, totalSizeBytes: 0 },
      items: [],
    }), start);
  }

  const files = [];
  const dirs = [];

  for (const line of rawLines) {
    if (line.startsWith('[DIR] ')) {
      dirs.push(line.slice(6).trim());
    } else if (line.startsWith('[FILE] ')) {
      const match = line.match(/^\[FILE\] (.+?) \((\d+) bytes\)/);
      if (match) {
        const fname = match[1];
        const sz = parseInt(match[2], 10) || 0;
        const ext = fname.includes('.') ? fname.split('.').pop().toLowerCase() : '';
        files.push({ name: fname, ext, size: sz });
      } else {
        const fname = line.slice(7).trim();
        const ext = fname.includes('.') ? fname.split('.').pop().toLowerCase() : '';
        files.push({ name: fname, ext, size: 0 });
      }
    }
  }

  files.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  dirs.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  // Groups by category
  const groups = {};
  for (const f of files) {
    const cat = getCategory(f.ext);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(f);
  }

  return Result.withDuration(Result.success('inspect', `Carpeta analizada: ${displayName}`, {
    type: 'directory',
    path: folderPath,
    displayName: originalPath,
    summary: {
      files: files.length,
      folders: dirs.length,
      totalSizeBytes: totalSize,
    },
    categories: groups,
    subfolders: dirs,
    deep,
  }), start);
}

export async function inspectFile(filePath, displayName, infoResult, start) {
  const ext = displayName.includes('.') ? displayName.split('.').pop().toLowerCase() : '';
  const typeDesc = getFileDescription(ext) || (ext ? `.${ext.toUpperCase()}` : 'Desconocido');

  const meta = {
    extension: ext,
    type: typeDesc,
    sizeBytes: 0,
    modifiedAt: null,
  };

  if (infoResult.success) {
    const sizeMatch = infoResult.output.match(/Tamaño: (\d+) bytes/);
    const mtime = infoResult.output.match(/Modificado: (.+)/);
    if (sizeMatch) meta.sizeBytes = parseInt(sizeMatch[1]);
    if (mtime) meta.modifiedAt = mtime[1].trim();
  }

  let preview = null;
  if (isTextExtension(ext)) {
    try {
      const readRes = await window.electronAPI.fileRead(filePath);
      if (readRes.success && readRes.output) {
        const text = readRes.output;
        const lines = text.split('\n');
        meta.lineCount = lines.length;
        meta.charCount = text.length;
        preview = lines.slice(0, 120).join('\n');
        if (lines.length > 120) preview += '\n... [archivo largo]';
      }
    } catch {}
  }

  return Result.withDuration(Result.success('inspect', `Archivo: ${displayName}`, {
    type: 'file',
    path: filePath,
    metadata: meta,
    preview,
  }), start || Date.now() - 0);
}
