export const ERR = {
  PATH_EMPTY: { code: 'PATH_EMPTY', message: 'No se especificó una ruta.', recoverable: true },
  PATH_NOT_FOUND: { code: 'PATH_NOT_FOUND', message: 'La ruta especificada no existe.', recoverable: true },
  PATH_NOT_ALLOWED: { code: 'PATH_NOT_ALLOWED', message: 'La ruta no está permitida.', recoverable: true },
  PERMISSION_DENIED: { code: 'PERMISSION_DENIED', message: 'No tengo permiso para acceder a esa ruta.', recoverable: true },
  FILE_NOT_FOUND: { code: 'FILE_NOT_FOUND', message: 'El archivo no existe.', recoverable: true },
  FOLDER_NOT_FOUND: { code: 'FOLDER_NOT_FOUND', message: 'La carpeta no existe.', recoverable: true },
  READ_ERROR: { code: 'READ_ERROR', message: 'No se pudo leer el archivo.', recoverable: true },
  WRITE_ERROR: { code: 'WRITE_ERROR', message: 'No se pudo escribir el archivo.', recoverable: true },
  DELETE_ERROR: { code: 'DELETE_ERROR', message: 'No se pudo eliminar el archivo.', recoverable: true },
  MOVE_ERROR: { code: 'MOVE_ERROR', message: 'No se pudo mover el archivo.', recoverable: true },
  COPY_ERROR: { code: 'COPY_ERROR', message: 'No se pudo copiar el archivo.', recoverable: true },
  SIZE_LIMIT: { code: 'SIZE_LIMIT', message: 'El archivo es demasiado grande para leerlo completo.', recoverable: true },
  FORMAT_NOT_SUPPORTED: { code: 'FORMAT_NOT_SUPPORTED', message: 'El formato del archivo no está soportado.', recoverable: true },
  DESTINATION_EXISTS: { code: 'DESTINATION_EXISTS', message: 'El destino ya existe.', recoverable: true },
  OPERATION_CANCELLED: { code: 'OPERATION_CANCELLED', message: 'Operación cancelada por el usuario.', recoverable: true },
  UNKNOWN_ERROR: { code: 'UNKNOWN_ERROR', message: 'Error desconocido.', recoverable: false },
};

export function buildError(err, details) {
  return {
    success: false,
    code: err.code,
    message: err.message,
    details: details || {},
    recoverable: err.recoverable,
  };
}
