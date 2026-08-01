import { createLogger } from '../../utils/logger.js';
const _log = createLogger('PATH_VALIDATOR');

const SENSITIVE_PATHS = [
  '\\windows\\', '\\windows', '\\system32', '\\syswow64',
  '\\program files', '\\program files (x86)',
  '\\programdata', '\\all users',
];

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'log', 'ini', 'cfg', 'conf', 'env', 'toml',
  'json', 'xml', 'yaml', 'yml',
  'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'php', 'go', 'rs', 'java', 'cs', 'cpp', 'c', 'h', 'lua',
  'sh', 'ps1', 'bat', 'cmd', 'swift', 'kt', 'dart', 'r', 'tex', 'rst', 'org',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'svg',
  'csv', 'tsv', 'sql',
  'gitignore', 'editorconfig', 'babelrc', 'eslintrc', 'prettierrc', 'npmrc', 'nvmrc',
  'dockerfile', 'htaccess',
]);

const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'odt', 'ods', 'odp', 'rtf', 'epub', 'mobi',
]);

const MEDIA_EXTENSIONS = {
  image: new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'raw', 'heic', 'heif', 'avif']),
  video: new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ts', 'vob', 'mpg', 'mpeg']),
  audio: new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'aiff']),
};

export function isSensitivePath(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  return SENSITIVE_PATHS.some(sp => lower.includes(sp));
}

export function getRiskLevel(operation, path) {
  if (!operation) return 'READ_ONLY';

  const opLower = operation.toLowerCase();

  if (['delete', 'delete_folder', 'delete_file'].includes(opLower)) {
    if (isSensitivePath(path)) return 'SYSTEM_SENSITIVE';
    return 'DESTRUCTIVE';
  }

  if (['move', 'rename'].includes(opLower)) {
    if (isSensitivePath(path)) return 'SYSTEM_SENSITIVE';
    return 'MODIFY';
  }

  if (['write', 'create', 'overwrite', 'append', 'copy', 'organize'].includes(opLower)) {
    if (isSensitivePath(path)) return 'SYSTEM_SENSITIVE';
    return 'MODIFY';
  }

  if (['read', 'list', 'info', 'find', 'search', 'summary', 'inspect'].includes(opLower)) {
    return 'READ_ONLY';
  }

  return 'READ_ONLY';
}

export function isTextExtension(ext) {
  return TEXT_EXTENSIONS.has(ext.toLowerCase());
}

export function isDocumentExtension(ext) {
  return DOCUMENT_EXTENSIONS.has(ext.toLowerCase());
}

export function getMediaType(ext) {
  const e = ext.toLowerCase();
  if (MEDIA_EXTENSIONS.image.has(e)) return 'image';
  if (MEDIA_EXTENSIONS.video.has(e)) return 'video';
  if (MEDIA_EXTENSIONS.audio.has(e)) return 'audio';
  return null;
}

export function getFileDescription(ext) {
  const DESCS = {
    pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel',
    ppt: 'PowerPoint', pptx: 'PowerPoint', txt: 'Texto plano', rtf: 'Texto enriquecido',
    odt: 'OpenDocument Texto', ods: 'OpenDocument Hoja', odp: 'OpenDocument Presentación',
    csv: 'Datos CSV', md: 'Markdown', epub: 'Libro digital', mobi: 'Libro Kindle',
    js: 'JavaScript', ts: 'TypeScript', jsx: 'React JSX', tsx: 'React TSX',
    mjs: 'ES Module', cjs: 'CommonJS', py: 'Python', rb: 'Ruby', php: 'PHP',
    go: 'Go', rs: 'Rust', java: 'Java', cs: 'C#', cpp: 'C++', c: 'C',
    h: 'Cabecera C', lua: 'Lua', sh: 'Shell Script', ps1: 'PowerShell',
    bat: 'Batch', cmd: 'Comando', swift: 'Swift', kt: 'Kotlin',
    html: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SASS', less: 'LESS',
    svg: 'Vector SVG', json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML',
    toml: 'Config TOML', ini: 'Config INI', cfg: 'Config', conf: 'Config',
    env: 'Variables de entorno', log: 'Registro', sql: 'SQL',
    jpg: 'Imagen JPEG', jpeg: 'Imagen JPEG', png: 'Imagen PNG', gif: 'GIF',
    webp: 'WebP', bmp: 'Bitmap', ico: 'Ícono',
    mp3: 'Audio MP3', wav: 'Audio WAV', flac: 'FLAC', aac: 'AAC',
    ogg: 'OGG', m4a: 'M4A',
    mp4: 'Video MP4', mkv: 'MKV', avi: 'AVI', mov: 'QuickTime',
    zip: 'ZIP', rar: 'RAR', '7z': '7-Zip', tar: 'TAR', gz: 'GZip',
    exe: 'Ejecutable', msi: 'Instalador', iso: 'Imagen ISO',
  };
  return DESCS[ext.toLowerCase()] || null;
}

export function getCategory(ext) {
  const CATEGORIES = {
    'Imágenes': ['jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff','tif','raw','heic','heif','avif'],
    'Videos': ['mp4','mkv','avi','mov','wmv','flv','webm','m4v','3gp','ts','vob','mpg','mpeg'],
    'Música': ['mp3','wav','flac','aac','ogg','m4a','wma','opus','aiff'],
    'Documentos': ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','odt','ods','odp','csv','md','epub','mobi'],
    'Código': ['js','ts','jsx','tsx','py','java','c','cpp','h','cs','php','rb','go','rs','swift','kt','lua','sh','ps1','bat','cmd','sql','html','css','scss','json','xml','yaml','yml','toml','ini','cfg','conf','env'],
    'Comprimidos': ['zip','rar','7z','tar','gz','bz2','xz','cab'],
    'Instaladores': ['exe','msi','msix','appx','iso','img'],
    'Minecraft': ['mcworld','mcpack','mcaddon','mctemplate','mcfunction'],
  };
  const e = ext.toLowerCase();
  for (const [cat, exts] of Object.entries(CATEGORIES)) {
    if (exts.includes(e)) return cat;
  }
  return 'Otros';
}

export function getCategoryEmoji(cat) {
  const map = {
    'Documentos': '📄', 'Imágenes': '📸', 'Videos': '🎬', 'Música': '🎵',
    'Código': '💻', 'Comprimidos': '🗜️', 'Instaladores': '💾', 'Minecraft': '⛏️', 'Otros': '📂',
  };
  return map[cat] || '📂';
}
