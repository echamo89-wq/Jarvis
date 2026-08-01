import { store } from '../../state/store.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('PATH_RESOLVER');

const KNOWN_FOLDERS = {
  descargas: 'Downloads', downloads: 'Downloads', download: 'Downloads',
  escritorio: 'Desktop', desktop: 'Desktop',
  documentos: 'Documents', documents: 'Documents',
  musica: 'Music', música: 'Music', music: 'Music',
  videos: 'Videos', video: 'Videos',
  imagenes: 'Pictures', imágenes: 'Pictures', imagenes: 'Pictures',
  pictures: 'Pictures',
  home: '', inicio: '',
  jarvis: 'Documents\\Jarvis',
  proyecto: 'Documents\\Jarvis', proyectos: 'Documents\\Jarvis',
};

const ENV_MAP = {
  '%USERPROFILE%': '',
  '%HOMEPATH%': '',
  '%DOCUMENTS%': '\\Documents',
  '%DESKTOP%': '\\Desktop',
  '%DOWNLOADS%': '\\Downloads',
  '%APPDATA%': '\\AppData\\Roaming',
  '%LOCALAPPDATA%': '\\AppData\\Local',
  '%WINDIR%': null,
  '%TEMP%': null,
  '%TMP%': null,
};

export function resolvePath(p) {
  if (!p || typeof p !== 'string') {
    return { success: false, code: 'PATH_EMPTY', original: p, resolvedPath: null };
  }

  let original = p.trim();
  let result = original;

  const home = store.get('homeDir') || 'C:\\Users\\Admin';

  result = result.replace(/^C:\\Users\\[^\\]+/i, home);

  result = result.replace(/%USERPROFILE%/gi, home);
  result = result.replace(/%HOMEPATH%/gi, home);
  result = result.replace(/%DOCUMENTS%/gi, home + '\\Documents');
  result = result.replace(/%DESKTOP%/gi, home + '\\Desktop');
  result = result.replace(/%DOWNLOADS%/gi, home + '\\Downloads');
  result = result.replace(/%APPDATA%/gi, home + '\\AppData\\Roaming');
  result = result.replace(/%LOCALAPPDATA%/gi, home + '\\AppData\\Local');
  const env = (typeof process !== 'undefined' && process.env) || {};
  result = result.replace(/%WINDIR%/gi, env.windir || 'C:\\Windows');
  result = result.replace(/%TEMP%/gi, env.temp || (home + '\\AppData\\Local\\Temp'));
  result = result.replace(/%TMP%/gi, env.tmp || (home + '\\AppData\\Local\\Temp'));

  result = result.replace(/\//g, '\\');

  if (!/^[A-Za-z]:\\/.test(result) && !result.includes('\\') && !result.includes('%')) {
    const lower = result.trim().toLowerCase();
    if (KNOWN_FOLDERS[lower] !== undefined) {
      result = home + (KNOWN_FOLDERS[lower] ? '\\' + KNOWN_FOLDERS[lower] : '');
    }
  }

  return {
    success: true,
    code: 'OK',
    original,
    resolvedPath: result,
  };
}

export async function resolvePathWithPowerShell(p) {
  const resolved = resolvePath(p);
  if (resolved.resolvedPath.includes('%')) {
    try {
      const r = await window.electronAPI.runPowerShell(
        `[Environment]::ExpandEnvironmentVariables('${resolved.resolvedPath.replace(/'/g, "''")}')`
      );
      if (r.success && r.output) {
        resolved.resolvedPath = r.output.trim();
      }
    } catch (e) {
      _log('warn', `PowerShell env expansion falló: ${e.message}`);
    }
  }
  return resolved;
}
