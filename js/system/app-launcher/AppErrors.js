export const AppErrorCode = {
  NOT_FOUND: 'APP_NOT_FOUND',
  AMBIGUOUS: 'APP_AMBIGUOUS',
  LAUNCH_FAILED: 'APP_LAUNCH_FAILED',
  VERIFICATION_FAILED: 'APP_VERIFICATION_FAILED',
  CATALOG_UNAVAILABLE: 'APP_CATALOG_UNAVAILABLE',
  DISCOVERY_FAILED: 'APP_DISCOVERY_FAILED',
  INVALID_INPUT: 'APP_INVALID_INPUT',
  NO_METHOD: 'APP_NO_METHOD',
  TIMEOUT: 'APP_TIMEOUT',
};

const messages = {
  [AppErrorCode.NOT_FOUND]: 'Application not found',
  [AppErrorCode.AMBIGUOUS]: 'Multiple applications matched',
  [AppErrorCode.LAUNCH_FAILED]: 'Failed to launch application',
  [AppErrorCode.VERIFICATION_FAILED]: 'Application verification failed',
  [AppErrorCode.CATALOG_UNAVAILABLE]: 'Catalog is not available',
  [AppErrorCode.DISCOVERY_FAILED]: 'Application discovery failed',
  [AppErrorCode.INVALID_INPUT]: 'Invalid input for application search',
  [AppErrorCode.NO_METHOD]: 'No suitable launch method available',
  [AppErrorCode.TIMEOUT]: 'Operation timed out',
};

export function errorMessage(code) {
  return messages[code] || `Unknown error: ${code}`;
}
