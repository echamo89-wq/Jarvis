import { AppErrorCode, errorMessage } from './AppErrors.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('APP_RESULT');

export function success(data = {}) {
  return {
    ok: true,
    error: null,
    errorCode: null,
    ...data,
  };
}

export function failure(code, extra = {}) {
  const msg = errorMessage(code);
  return {
    ok: false,
    error: msg,
    errorCode: code,
    ...extra,
  };
}

export function launchResult(resolveEntry, attempt) {
  const displayName = resolveEntry ? (resolveEntry._matchedName || resolveEntry.name || 'unknown') : 'unknown';
  if (attempt.success) {
    return success({
      app: displayName,
      resolvedBy: resolveEntry ? resolveEntry._resolvedBy : null,
      method: attempt.method,
      path: attempt.path || attempt.command || null,
      durationMs: attempt.durationMs,
      verificationStatus: 'pending',
      verification: null,
    });
  }
  return failure(AppErrorCode.LAUNCH_FAILED, {
    app: displayName,
    method: attempt.method || 'none',
    attemptError: attempt.error,
    durationMs: attempt.durationMs,
  });
}

export function verifyPendingResult(resolveEntry, attempt) {
  const base = launchResult(resolveEntry, attempt);
  base.verificationStatus = 'pending';
  base.verification = null;
  return base;
}

export function verifyDoneResult(baseResult, verifyResult) {
  return {
    ...baseResult,
    verificationStatus: verifyResult ? 'confirmed' : 'failed',
    verification: verifyResult,
  };
}

export function notFound(query) {
  return failure(AppErrorCode.NOT_FOUND, { query, searchedMethods: [] });
}
