import { createLogger } from '../../utils/logger.js';
import { resolvePath, Organizer, inspectPath } from './adapter-file-system.js';
import * as PathValidator from '../../system/file-system/PathValidator.js';
const _log = createLogger('ORGANIZER');

export async function handleOrganizeFolder(call) {
  const { path, mode = 'preview', filter } = call.args;
  if (!path) {
    return {
      success: false,
      output: 'Necesito la ruta de la carpeta. Por ejemplo: "Descargas", "Documentos", "%USERPROFILE%\\Downloads".',
    };
  }

  const resolved = resolvePath(path);
  if (!resolved.success) {
    return { success: false, output: `No encontré la ruta: "${path}".` };
  }
  const folderPath = resolved.resolvedPath;
  _log('info', `organize_folder: mode=${mode} path="${folderPath}"`);

  try {
    if (mode === 'inspect') {
      return await handleInspect(folderPath, path, filter);
    }

    if (mode === 'preview') {
      const result = await Organizer.preview(folderPath);
      if (!result.success) return { success: false, output: result.message };
      const data = result.data || {};
      const total = data.total || 0;
      if (total === 0) {
        return { success: true, output: `La carpeta "${path}" no tiene archivos sueltos que organizar. ¡Ya está limpia!` };
      }
      const cats = Object.entries(data.categories || {})
        .map(([cat, count]) => `  ${PathValidator.getCategoryEmoji(cat)} **${cat}**: ${count} archivo${count !== 1 ? 's' : ''}`)
        .join('\n');
      return {
        success: true,
        output: `🔍 Vista previa de "${path}":\n\nVoy a organizar **${total} archivo${total !== 1 ? 's' : ''}** en estas carpetas:\n${cats}\n\nDecime **"organizá"** para proceder, o **"cancelá"** si no querés hacerlo.`,
      };
    }

    if (mode === 'execute') {
      const result = await Organizer.execute(folderPath);
      if (!result.success) return { success: false, output: result.message };
      const data = result.data || {};
      const moved = data.moved || 0;
      const skipped = data.skipped || 0;
      const errors = data.errors || 0;
      let summary = `✅ **Organización completada** en "${path}":\n  • **${moved}** archivos movidos`;
      if (skipped > 0) summary += `\n  • ${skipped} omitidos`;
      if (errors > 0) summary += `\n  • ⚠️ ${errors} errores`;
      const cats = Object.entries(data.categories || {})
        .map(([cat, count]) => `  ${PathValidator.getCategoryEmoji(cat)} **${cat}**: ${count} archivo${count !== 1 ? 's' : ''}`)
        .join('\n');
      if (cats) summary += `\n\n${cats}`;
      summary += `\n\nSe guardó un registro para deshacer. Si algo salió mal, decime **"deshacé la organización"**.`;
      return { success: true, output: summary };
    }

    if (mode === 'undo') {
      const result = await Organizer.undo(folderPath);
      if (!result.success) return { success: false, output: result.message };
      const data = result.data || {};
      const restored = data.restored || 0;
      const errors = data.errors || 0;
      let msg = `↩️ **Organización deshecha** en "${path}":\n  • ${restored} archivos restaurados a su lugar original`;
      if (errors > 0) msg += `\n  • ⚠️ ${errors} archivos no se pudieron restaurar`;
      msg += `\n\nLas carpetas vacías fueron eliminadas.`;
      return { success: true, output: msg };
    }

    return { success: false, output: 'Modo inválido. Opciones: preview, execute, undo, inspect.' };
  } catch (e) {
    _log('error', `organize_folder exception: ${e.message}`);
    return { success: false, output: `Error: ${e.message}` };
  }
}

async function handleInspect(folderPath, originalPath, filter) {
  const result = await inspectPath(folderPath, { filter });
  if (!result.success) {
    return { success: false, output: result.message || 'No se pudo leer la carpeta.' };
  }

  const data = result.data;
  const summary = data.summary || {};
  const totalFiles = summary.files || 0;
  const totalDirs = summary.folders || 0;

  if (totalFiles === 0 && totalDirs === 0) {
    return { success: true, output: `La carpeta "${originalPath}" está vacía.` };
  }

  // Build flat file list respecting filter
  const categories = data.categories || {};
  let allFiles = [];
  for (const catFiles of Object.values(categories)) {
    allFiles = allFiles.concat(catFiles);
  }

  const filterExt = (filter || '').toLowerCase().replace(/^\./, '');
  const filtered = filterExt ? allFiles.filter(f => f.ext === filterExt) : allFiles;

  let out = `📁 **${originalPath}**\n`;
  const hdrParts = [];
  if (totalDirs > 0) hdrParts.push(`${totalDirs} subcarpeta${totalDirs !== 1 ? 's' : ''}`);
  if (totalFiles > 0) hdrParts.push(`${totalFiles} archivo${totalFiles !== 1 ? 's' : ''} en raíz`);
  if (hdrParts.length) out += hdrParts.join(' · ') + '\n';

  // Subfolders
  const dirs = data.subfolders || [];
  if (dirs.length > 0) {
    const MAX_DIRS = 40;
    out += `\n📂 **Subcarpetas (${totalDirs}):**\n`;
    for (const d of dirs.slice(0, MAX_DIRS)) {
      out += `  • **${d}**\n`;
    }
    if (totalDirs > MAX_DIRS) out += `  _...y ${totalDirs - MAX_DIRS} subcarpeta(s) más._\n`;
  }

  // Files grouped
  if (filtered.length > 0) {
    const label = filterExt ? ` (.${filterExt})` : '';
    out += `\n📄 **Archivos en raíz${label} (${filtered.length}):**\n`;

    const grouped = {};
    for (const f of filtered) {
      const cat = PathValidator.getCategory(f.ext);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
    }

    const CAT_ORDER = ['Documentos', 'Imágenes', 'Videos', 'Música', 'Código', 'Comprimidos', 'Instaladores', 'Minecraft', 'Otros'];
    const sortedCats = Object.keys(grouped).sort((a, b) => {
      const ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

    for (const cat of sortedCats) {
      const cf = grouped[cat];
      const MAX_FILES = 40;
      out += `\n${PathValidator.getCategoryEmoji(cat)} **${cat}** (${cf.length}):\n`;
      for (const f of cf.slice(0, MAX_FILES)) {
        const desc = PathValidator.getFileDescription(f.ext) ? ` · _${PathValidator.getFileDescription(f.ext)}_` : '';
        out += `  • **${f.name}** — ${fmtSize(f.size)}${desc}\n`;
      }
      if (cf.length > MAX_FILES) out += `  _...y ${cf.length - MAX_FILES} archivo(s) más._\n`;
    }
  } else if (filterExt && totalFiles > 0) {
    out += `\n_No hay archivos .${filterExt} en la raíz de esta carpeta._\n`;
  }

  out += `\nPodés pedirme que **entre a una subcarpeta**, **lea un archivo**, **busque algo específico**, u **organice** los archivos sueltos.`;
  return { success: true, output: out };
}

function fmtSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}
