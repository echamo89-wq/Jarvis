import { createLogger as createKernelLogger } from '../kernel/logger.js';

export function createLogger(tag) {
  const kLogger = createKernelLogger(tag);
  return function _log(type, msg) {
    if (type === 'error') kLogger.error(msg);
    else if (type === 'warn') kLogger.warn(msg);
    else kLogger.info(msg);
  };
}
