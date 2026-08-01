const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { isPathSafe: _isPathSafe } = require('../../utils/path-safety');

const MEDIA_EXTENSIONS = {
  images: ['.jpg','.jpeg','.png','.gif','.bmp','.webp','.svg','.ico'],
  videos: ['.mp4','.avi','.mkv','.mov','.wmv','.flv','.webm','.m4v','.mpg','.mpeg'],
  audio:  ['.mp3','.wav','.flac','.ogg','.aac','.m4a','.wma','.opus']
};

function _formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const _SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'vendor', 'appdata', 'temp', 'cache', 'local settings', 'library', 'windows', 'program files', 'program files (x86)']);
const _searchRxCache = new Map();

function _compileSearchPattern(pattern) {
  if (!pattern) return null;
  const cached = _searchRxCache.get(pattern);
  if (cached) return cached;
  if (pattern.includes('*') || pattern.includes('?')) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\\-\/]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    try {
      const rx = new RegExp(regexStr, 'i');
      _searchRxCache.set(pattern, { type: 'rx', rx });
      return { type: 'rx', rx };
    } catch (e) { return null; }
  }
  const lower = pattern.toLowerCase();
  const keywords = lower.split(/[\s_\-\.\*]+/).filter(w => w.length > 2);
  _searchRxCache.set(pattern, { type: 'kw', lower, keywords });
  return { type: 'kw', lower, keywords };
}

function _matchName(name, compiled) {
  if (!compiled) return true;
  const lower = name.toLowerCase();
  if (compiled.type === 'rx') return compiled.rx.test(name);
  if (lower.includes(compiled.lower)) return true;
  if (compiled.keywords.length > 0 && compiled.keywords.every(kw => lower.includes(kw))) return true;
  return false;
}

async function _findFilesRecursive(rootDir, pattern, maxResults) {
  const results = [];
  const queue = [{ dir: rootDir, depth: 0 }];
  let qi = 0;
  const compiled = _compileSearchPattern(pattern);

  while (qi < queue.length && results.length < maxResults) {
    const { dir, depth } = queue[qi++];
    if (depth > 8) continue;

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
      if (!entries.length) continue;

      for (const entry of entries) {
        if (results.length >= maxResults) break;
        const lowerName = entry.name.toLowerCase();
        if (_SKIP_DIRS.has(lowerName)) continue;

        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
          if (_matchName(entry.name, compiled)) {
            try {
              const fullPath = path.join(dir, entry.name);
              results.push(`[DIR] ${fullPath}`);
            } catch {}
          }
        } else if (entry.isFile() && _matchName(entry.name, compiled)) {
          try {
            const fullPath = path.join(dir, entry.name);
            const s = await fs.promises.stat(fullPath);
            results.push(`[FILE] ${fullPath} (${s.size} bytes) ${s.mtime.toISOString().slice(0, 10)}`);
          } catch {}
        }
      }
    } catch {}
  }
  return results;
}

function registerFileOperations() {
  ipcMain.handle('file-read', async (event, filePath) => {
    try {
      if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      if (!fs.existsSync(filePath)) return { success: false, output: 'ERR_FILE_NOT_FOUND' };
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, output: content };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-write', async (event, filePath, content) => {
    try {
      if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      if (typeof content !== 'string') return { success: false, output: 'ERR_INVALID_CONTENT' };
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, output: `Archivo escrito: ${filePath}` };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-delete', async (event, filePath) => {
    try {
      if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      if (!fs.existsSync(filePath)) return { success: false, output: 'ERR_FILE_NOT_FOUND' };
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const items = fs.readdirSync(filePath);
        for (const item of items) {
          const fullPath = path.join(filePath, item);
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
        if (items.length === 0) return { success: true, output: `Carpeta vacía: ${filePath}` };
        return { success: true, output: `Contenido eliminado (${items.length} items): ${filePath}` };
      } else {
        fs.unlinkSync(filePath);
        return { success: true, output: `Eliminado: ${filePath}` };
      }
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-delete-folder', async (event, filePath) => {
    try {
      if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      if (!fs.existsSync(filePath)) return { success: false, output: 'ERR_FILE_NOT_FOUND' };
      const stat = fs.statSync(filePath);
      if (!stat.isDirectory()) return { success: false, output: 'ERR_NOT_A_DIRECTORY' };
      fs.rmSync(filePath, { recursive: true, force: true });
      return { success: true, output: `Carpeta eliminada: ${filePath}` };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-list', async (event, dirPath, pattern) => {
    try {
      if (!_isPathSafe(dirPath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      const exists = await fs.promises.access(dirPath).then(() => true).catch(() => false);
      if (!exists) return { success: false, output: 'ERR_PATH_NOT_FOUND' };
      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const filter = pattern ? new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;
      const filtered = filter ? items.filter(i => filter.test(i.name)) : items;

      // Run stat calls in parallel (max 64 concurrent) to avoid blocking
      const BATCH = 64;
      const lines = new Array(filtered.length);
      for (let start = 0; start < filtered.length; start += BATCH) {
        const batch = filtered.slice(start, start + BATCH);
        await Promise.all(batch.map(async (entry, bi) => {
          const idx = start + bi;
          if (entry.isFile()) {
            try {
              const s = await fs.promises.stat(path.join(dirPath, entry.name));
              lines[idx] = `[FILE] ${entry.name} (${s.size} bytes) ${s.mtime.toISOString().slice(0, 10)}`;
            } catch { lines[idx] = `[FILE] ${entry.name}`; }
          } else {
            lines[idx] = `[DIR] ${entry.name}`;
          }
        }));
      }
      return { success: true, output: lines.join('\n') || '(vacío)' };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-info', async (event, filePath) => {
    try {
      if (!_isPathSafe(filePath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      if (!fs.existsSync(filePath)) return { success: false, output: 'ERR_FILE_NOT_FOUND' };
      const s = fs.statSync(filePath);
      const info = [
        `Nombre: ${path.basename(filePath)}`,
        `Tamaño: ${s.size} bytes`,
        `Creado: ${s.birthtime.toISOString()}`,
        `Modificado: ${s.mtime.toISOString()}`,
        `Es directorio: ${s.isDirectory() ? 'Sí' : 'No'}`,
      ].join('\n');
      return { success: true, output: info };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-summary', async (event, dirPath) => {
    try {
      if (!_isPathSafe(dirPath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      const exists = await fs.promises.access(dirPath).then(() => true).catch(() => false);
      if (!exists) return { success: false, output: 'ERR_PATH_NOT_FOUND' };
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const dirs = [];
      const files = [];
      let totalSize = 0;
      const maxShow = 5;
      await Promise.all(entries.map(async (entry) => {
        try {
          if (entry.isDirectory()) { dirs.push(entry.name); }
          else {
            const s = await fs.promises.stat(path.join(dirPath, entry.name));
            totalSize += s.size;
            if (files.length <= maxShow + 5) {
              files.push({ name: entry.name, size: s.size, mtime: s.mtime });
            }
          }
        } catch {}
      }));
      dirs.sort((a, b) => a.localeCompare(b));
      files.sort((a, b) => a.name.localeCompare(b.name));
      const folderName = path.basename(dirPath) || dirPath;
      let summary = `${folderName} (${dirPath})\n`;
      if (dirs.length) {
        const dirList = dirs.length <= 8 ? dirs.join(', ') : dirs.slice(0, 7).join(', ') + ` y ${dirs.length - 7} más`;
        summary += `  ${dirs.length} carpeta(s): ${dirList}\n`;
      }
      summary += `  ${files.length} archivo(s) (${_formatSize(totalSize)})\n`;
      if (files.length) {
        const shown = files.slice(0, Math.min(maxShow, files.length));
        for (const f of shown) {
          const shortName = f.name.length > 45 ? f.name.substring(0, 42) + '...' : f.name;
          summary += `  - ${shortName} (${_formatSize(f.size)})\n`;
        }
        if (files.length > maxShow) summary += `  ... y ${files.length - maxShow} archivo(s) más\n`;
      }
      return { success: true, output: summary };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-media-find', async (event, dirPath, mediaType = 'all', maxResults = 30) => {
    try {
      if (!_isPathSafe(dirPath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      if (!fs.existsSync(dirPath)) return { success: false, output: 'ERR_PATH_NOT_FOUND' };
      const exts = new Set(mediaType === 'all'
        ? [...MEDIA_EXTENSIONS.images, ...MEDIA_EXTENSIONS.videos, ...MEDIA_EXTENSIONS.audio]
        : MEDIA_EXTENSIONS[mediaType] || MEDIA_EXTENSIONS.images);
      const safeMax = Math.min(maxResults, 200);
      const results = [];
      const queue = [{ dir: dirPath, depth: 0 }];
      let qi = 0;
      while (qi < queue.length && results.length < safeMax) {
        const { dir, depth } = queue[qi++];
        if (depth > 6) continue;
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const entry of entries) {
            if (results.length >= safeMax) break;
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
              queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (exts.has(ext)) {
                try {
                  const s = await fs.promises.stat(path.join(dir, entry.name));
                  results.push(`${entry.name} (${_formatSize(s.size)}) — ${path.join(dir, entry.name)}`);
                } catch {}
              }
            }
          }
        } catch {}
      }
      const typeLabel = mediaType === 'all' ? 'multimedia' : mediaType;
      return {
        success: true,
        output: results.length
          ? `${results.length} archivo(s) de ${typeLabel} encontrados:\n` + results.join('\n')
          : `No se encontraron archivos de ${typeLabel} en ${dirPath}`
      };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });

  ipcMain.handle('file-find', async (event, dirPath, searchPattern, maxResults = 20) => {
    try {
      if (!_isPathSafe(dirPath)) return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      if (!fs.existsSync(dirPath)) return { success: false, output: 'ERR_PATH_NOT_FOUND' };
      const safeMax = Math.min(maxResults, 100);
      const results = await _findFilesRecursive(dirPath, searchPattern, safeMax);
      return { success: true, output: results.join('\n') || `No se encontraron archivos con "${searchPattern}" en ${dirPath}` };
    } catch (err) {
      return { success: false, output: `Error: ${err.message}` };
    }
  });
}

module.exports = { registerFileOperations };