import * as Reader from './FileReader.js';
import * as Writer from './FileWriter.js';
import * as Searcher from './FileSearcher.js';
import * as Mover from './FileMover.js';
import * as Deleter from './FileDeleter.js';
import * as Inspector from './FileInspector.js';
import * as DocProc from './DocumentProcessor.js';
import * as MediaFinder from './MediaFinder.js';
import * as Organizer from './FolderOrganizer.js';
import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import * as Result from './FileResult.js';

export async function execute(config) {
  const { tool, operation, args } = config;
  Result.setCurrentTool(tool || operation || 'file_operation');

  switch (tool || operation) {
    case 'read':
    case 'file_read':
      return await Reader.readFile(args?.path, args);

    case 'write':
    case 'file_write':
      return await Writer.writeFile(args?.path, args?.content, args?.mode);

    case 'search':
    case 'find':
    case 'file_search':
    case 'file_find':
      return await Searcher.searchFiles({
        query: args?.query || args?.pattern,
        roots: args?.roots,
        searchMode: args?.searchMode || args?.mode || 'name',
        maxResults: args?.maxResults,
        mediaType: args?.mediaType,
      });

    case 'search_content':
    case 'search_documents':
      return await Searcher.searchFiles({
        query: args?.query || args?.pattern,
        roots: args?.roots || ['Documents', 'Downloads', 'Desktop'],
        searchMode: 'content',
        maxResults: args?.maxResults || 20,
      });

    case 'search_media':
    case 'media_find':
      return await MediaFinder.findMedia({
        path: args?.path,
        mediaType: args?.mediaType || 'all',
        maxResults: args?.maxResults,
      });

    case 'move':
    case 'file_move':
      return await Mover.moveFile(args?.path, args?.destination);

    case 'copy':
    case 'file_copy':
      return await Mover.copyFile(args?.path, args?.destination);

    case 'delete':
    case 'file_delete':
      return await Deleter.deleteFile(args?.path);

    case 'delete_folder':
    case 'folder_delete':
      return await Deleter.deleteFolder(args?.path);

    case 'list':
    case 'file_list':
      return await listDirectory(args?.path, args?.pattern);

    case 'summary':
    case 'file_summary':
      return await directorySummary(args?.path);

    case 'info':
    case 'file_info':
      return await Inspector.inspectPath(args?.path, { deep: args?.deep });

    case 'inspect':
      return await Inspector.inspectPath(args?.path, { deep: args?.deep, filter: args?.filter });

    case 'process':
    case 'process_file':
      return await DocProc.processDocument(args?.path, args?.format);

    case 'organize_preview':
      return await Organizer.preview(args?.path);

    case 'organize_execute':
      return await Organizer.execute(args?.path);

    case 'organize_undo':
      return await Organizer.undo(args?.path);

    case 'open':
    case 'open_file':
      return await openFile(args?.path);

    default:
      return Result.error(operation || 'unknown', 'UNKNOWN_OPERATION',
        `Operación desconocida: ${operation}`, { operation });
  }
}

export async function executeOperation(op, args) {
  return await execute({ tool: op, operation: op, args });
}

async function listDirectory(path, pattern) {
  const perm = await ensurePermittedWithDetails(path, 'list');
  if (!perm.success) return perm;

  const r = await window.electronAPI.fileList(perm.path, pattern || '');
  if (!r.success) {
    return Result.error('list', 'LIST_ERROR', r.output || 'No se pudo listar.', { path });
  }
  return Result.success('list', 'Directorio listado.', {
    path: perm.path,
    items: (r.output || '').split('\n').filter(Boolean),
    raw: r.output,
  });
}

async function directorySummary(path) {
  const perm = await ensurePermittedWithDetails(path, 'list');
  if (!perm.success) return perm;

  const r = await window.electronAPI.fileSummary(perm.path);
  if (!r.success) {
    return Result.error('summary', 'SUMMARY_ERROR', r.output || 'No se pudo obtener resumen.', { path });
  }
  return Result.success('summary', 'Resumen obtenido.', {
    path: perm.path,
    summary: r.output,
  });
}

async function openFile(path) {
  const resolved = resolvePath(path);
  if (!resolved.success) {
    return Result.pathNotFound('open', path);
  }

  // Expand remaining %VAR%
  let finalPath = resolved.resolvedPath;
  if (finalPath.includes('%')) {
    try {
      const r = await window.electronAPI.runPowerShell(
        `[Environment]::ExpandEnvironmentVariables('${finalPath.replace(/'/g, "''")}')`
      );
      if (r.success && r.output) finalPath = r.output.trim();
    } catch {}
  }

  try {
    const r = await window.electronAPI.openPath(finalPath);
    const success = r && (r.success === undefined || r.success === true);
    if (success) {
      return Result.success('open', `Abriendo: ${finalPath}`, { path: finalPath });
    }
    return Result.error('open', 'OPEN_ERROR', r?.output || 'No se pudo abrir.', { path: finalPath });
  } catch (e) {
    return Result.error('open', 'OPEN_ERROR', e.message, { path: finalPath });
  }
}
