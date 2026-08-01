import * as Reader from './FileReader.js';
import * as Writer from './FileWriter.js';
import * as Searcher from './FileSearcher.js';
import * as Mover from './FileMover.js';
import * as Deleter from './FileDeleter.js';
import * as Inspector from './FileInspector.js';
import { resolvePath } from './PathResolver.js';

const FileSystemCore = {
  resolvePath,
  read: Reader.readFile,
  write: Writer.writeFile,
  append: Writer.appendFile,
  search: Searcher.searchFiles,
  move: Mover.moveFile,
  copy: Mover.copyFile,
  delete: Deleter.deleteFile,
  deleteFolder: Deleter.deleteFolder,
  inspect: Inspector.inspectPath,
  list: async (path, pattern) => {
    const { ensurePermittedWithDetails } = await import('./FilePermissionManager.js');
    const perm = await ensurePermittedWithDetails(path, 'list');
    if (!perm.success) return perm;
    const r = await window.electronAPI.fileList(perm.path, pattern || '');
    return { success: r.success, data: r };
  },
};

export default FileSystemCore;
