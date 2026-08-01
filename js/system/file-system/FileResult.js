let _toolName = 'file_operation';

export function setCurrentTool(name) {
  _toolName = name;
}

export function success(operation, message, data, warnings) {
  return {
    success: true,
    tool: _toolName,
    operation,
    message: message || 'Operación completada.',
    data: data || {},
    warnings: warnings || [],
    errors: [],
    metadata: {
      durationMs: 0,
      timestamp: new Date().toISOString(),
    },
  };
}

export function error(operation, code, message, details, recoverable) {
  return {
    success: false,
    tool: _toolName,
    operation,
    code: code || 'UNKNOWN_ERROR',
    message: message || 'Error desconocido.',
    details: details || {},
    recoverable: recoverable !== false,
    errors: [{ code, message, details }],
    metadata: {
      durationMs: 0,
      timestamp: new Date().toISOString(),
    },
  };
}

export function withDuration(result, startTime) {
  if (result && result.metadata) {
    result.metadata.durationMs = Date.now() - startTime;
  }
  return result;
}

export function permissionDenied(operation, path) {
  return error(
    operation,
    'PERMISSION_DENIED',
    `No tengo permiso para acceder a "${path}".`,
    { path },
    true
  );
}

export function pathNotFound(operation, path) {
  return error(
    operation,
    'PATH_NOT_FOUND',
    `No encontré "${path}". Verificá que la ruta exista.`,
    { path },
    true
  );
}
