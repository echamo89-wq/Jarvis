import { createLogger } from '../../utils/logger.js';
import {
  isPathAllowed, grantFullAccess, grantOnce, consumeOnce,
} from '../../state/file-permissions.js';
import { requestFilePermission, cancelPendingPermission } from '../../chat/file-permission-dialog.js';
import { resolvePath } from './PathResolver.js';
import { getRiskLevel } from './PathValidator.js';

const _log = createLogger('FILE_PERMISSION');

const RISK_LABELS = {
  READ_ONLY: 'bajo',
  LOW_RISK: 'bajo',
  MODIFY: 'medio',
  DESTRUCTIVE: 'alto',
  SYSTEM_SENSITIVE: 'crítico',
};

export async function ensurePermitted(path, operation) {
  const resolved = resolvePath(path);
  if (!resolved.success) {
    return { permitted: false, reason: 'Ruta vacía o inválida', path: null };
  }

  const targetPath = resolved.resolvedPath;
  const riskLevel = getRiskLevel(operation, targetPath);

  // READ_ONLY paths don't need confirmation if already visited or if it's a well-known folder
  if (riskLevel === 'READ_ONLY') {
    return { permitted: true, path: targetPath, riskLevel };
  }

  if (isPathAllowed(targetPath)) {
    return { permitted: true, path: targetPath, riskLevel };
  }

  cancelPendingPermission();

  const riskLabel = RISK_LABELS[riskLevel] || 'medio';
  const choice = await requestFilePermission(targetPath, operation, riskLabel);

  if (choice === 'all') {
    grantFullAccess(targetPath);
    return { permitted: true, path: targetPath, riskLevel };
  }
  if (choice === 'once') {
    grantOnce(targetPath);
    return { permitted: true, path: targetPath, riskLevel, once: true };
  }
  return { permitted: false, reason: 'Permiso denegado por el usuario', path: targetPath, riskLevel };
}

export async function ensurePermittedWithDetails(path, operation) {
  const result = await ensurePermitted(path, operation);
  if (!result.permitted) {
    return {
      success: false,
      code: 'PERMISSION_DENIED',
      message: `No tengo permiso para ${operation} en esa ruta.`,
      details: { path, operation, riskLevel: result.riskLevel },
      recoverable: true,
    };
  }
  return { success: true, path: result.path, once: result.once };
}

export function consumePermission(path) {
  consumeOnce(path);
}
