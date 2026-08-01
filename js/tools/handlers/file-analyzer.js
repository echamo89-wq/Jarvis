import { createLogger } from '../../utils/logger.js';
import { resolvePath, ensurePermitted, inspectPath } from '../handlers/adapter-file-system.js';
const _log = createLogger('ANALYZER');

export async function handleAnalyzePath(call) {
  const rawPath = (call.args.path || '').trim();
  const deep = call.args.deep === true;

  if (!rawPath) {
    return { success: false, output: 'Indicame la ruta o carpeta a analizar.' };
  }

  _log('info', `analyze_path: "${rawPath}" deep=${deep}`);

  const result = await inspectPath(rawPath, { deep });
  if (!result.success) {
    return { success: false, output: result.message || `No encontré "${rawPath}".` };
  }

  const data = result.data;
  if (!data) {
    return { success: false, output: `No encontré "${rawPath}". Verificá que la ruta exista.` };
  }

  if (data.type === 'directory') {
    return formatFolderOutput(rawPath, data);
  }

  return formatFileOutput(data);
}

function formatFolderOutput(rawPath, data) {
  const displayName = rawPath;
  const summary = data.summary || {};
  const categories = data.categories || {};
  const dirs = data.subfolders || [];
  const totalFiles = summary.files || 0;
  const totalDirs = summary.folders || 0;

  if (totalFiles === 0 && totalDirs === 0) {
    return { success: true, output: `La carpeta "${displayName}" está vacía.` };
  }

  const parts = [];
  const shortName = displayName.split('\\').pop() || displayName;
  parts.push(`Carpeta: ${shortName} (${data.path})`);
  parts.push(`Total: ${totalFiles} archivo(s), ${totalDirs} subcarpeta(s)`);

  if (dirs.length > 0) {
    parts.push('');
    parts.push(`Subcarpetas (${dirs.length}):`);
    const maxDirs = 50;
    dirs.slice(0, maxDirs).forEach((d, i) => {
      parts.push(`  ${i + 1}. [Carpeta] ${d}`);
    });
    if (dirs.length > maxDirs) parts.push(`  ... y ${dirs.length - maxDirs} carpetas más`);
  }

  if (totalFiles > 0) {
    parts.push('');
    parts.push(`Archivos (${totalFiles}):`);
    const catOrder = ['Documentos', 'Imágenes', 'Videos', 'Música', 'Código', 'Comprimidos', 'Instaladores', 'Minecraft', 'Otros'];
    let fileNum = 1;
    for (const cat of catOrder) {
      const catFiles = categories[cat];
      if (!catFiles || catFiles.length === 0) continue;
      const emoji = getEmoji(cat);
      parts.push('');
      parts.push(`  ${emoji} ${cat} (${catFiles.length}):`);
      const maxPerCat = 60;
      catFiles.slice(0, maxPerCat).forEach(f => {
        const desc = getDesc(f.ext) ? ` [${getDesc(f.ext)}]` : (f.ext ? ` [.${f.ext}]` : '');
        const sz = f.size > 0 ? ` — ${fmtSize(f.size)}` : '';
        parts.push(`    ${fileNum}. ${f.name}${desc}${sz}`);
        fileNum++;
      });
      if (catFiles.length > maxPerCat) {
        parts.push(`    ... y ${catFiles.length - maxPerCat} archivos más`);
      }
    }
  }

  return { success: true, output: parts.join('\n') };
}

function formatFileOutput(data) {
  const meta = data.metadata || {};
  const fname = data.path.split('\\').pop() || data.path;
  const lines = [];
  lines.push(`Archivo: ${fname}`);
  lines.push(`Tipo: ${meta.type || 'Desconocido'}`);
  if (meta.sizeBytes) lines.push(`Tamaño: ${fmtSize(meta.sizeBytes)}`);
  if (meta.modifiedAt) lines.push(`Modificado: ${meta.modifiedAt.slice(0, 10)}`);
  lines.push(`Ruta: ${data.path}`);

  if (meta.charCount !== undefined) {
    lines.push(`Líneas: ${meta.lineCount} | Caracteres: ${meta.charCount}`);
  }

  if (data.preview) {
    lines.push('');
    lines.push('Contenido:');
    lines.push('---');
    lines.push(data.preview);
  } else {
    lines.push('');
    lines.push('Este archivo es binario. Para leer su contenido, pedime que lo abra con la aplicación correspondiente.');
  }

  return { success: true, output: lines.join('\n') };
}

function getEmoji(cat) {
  const map = {
    'Documentos': '📄', 'Imágenes': '📸', 'Videos': '🎬', 'Música': '🎵',
    'Código': '💻', 'Comprimidos': '🗜️', 'Instaladores': '💾', 'Minecraft': '⛏️', 'Otros': '📂',
  };
  return map[cat] || '📂';
}

function getDesc(ext) {
  const map = {
    pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel',
    js: 'JavaScript', ts: 'TypeScript', html: 'HTML', css: 'CSS',
    json: 'JSON', xml: 'XML', txt: 'Texto', md: 'Markdown', csv: 'CSV',
    py: 'Python', java: 'Java', cpp: 'C++', go: 'Go', rs: 'Rust',
  };
  return map[ext] || null;
}

function fmtSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}
