const { app } = require('electron');
const path = require('path');

const _home = process.env.USERPROFILE || process.env.HOME || '';

const ALLOWED_FILE_ROOTS = [
  _home,
  app.getPath('temp'),
  app.getPath('desktop'),
  app.getPath('documents'),
  app.getPath('downloads'),
  app.getPath('music'),
  app.getPath('pictures'),
  app.getPath('videos'),
  app.getPath('home'),
  ...(_home ? [
    path.join(_home, 'Desktop'),
    path.join(_home, 'Documents'),
    path.join(_home, 'Downloads'),
    path.join(_home, 'Pictures'),
    path.join(_home, 'Music'),
    path.join(_home, 'Videos'),
    path.join(_home, 'OneDrive'),
  ] : []),
].filter(Boolean);

/**
 * Verifica que targetPath esté bajo una de las raíces permitidas.
 * Previene path traversal y acceso a rutas del sistema.
 */
function isPathSafe(targetPath) {
  try {
    const resolved = path.resolve(targetPath);
    const normalized = resolved.toLowerCase();
    return ALLOWED_FILE_ROOTS.some(root => root && (
      normalized === root.toLowerCase() ||
      normalized.startsWith(root.toLowerCase() + path.sep)
    ));
  } catch { return false; }
}

module.exports = { isPathSafe, ALLOWED_FILE_ROOTS };
