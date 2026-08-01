/**
 * document-writer.js — Handler para create_document (renderer side)
 * Recibe los parámetros de Gemini, busca info real si se pide,
 * y delega la creación al proceso principal vía IPC.
 */

import { createLogger } from '../../utils/logger.js';
const _log = createLogger('DOC-WRITER');

// ── Expandir rutas comunes ────────────────────────────────────────────────────
function _resolveDestPath(dest) {
  if (!dest) return 'Desktop';
  const map = {
    escritorio: 'Desktop', desktop: 'Desktop',
    documentos: 'Documents', documents: 'Documents',
    descargas: 'Downloads', downloads: 'Downloads',
  };
  return map[dest.toLowerCase()] || dest;
}

// ── Formatear tamaño de output ────────────────────────────────────────────────
function _fmtOutput(res) {
  const emoji = {
    pdf: '📄', rtf: '📝', docx: '📝', doc: '📝',
    html: '🌐', md: '📋', txt: '📃', csv: '📊', json: '🔧',
  };
  const e = emoji[res.format] || '📄';
  return `${e} Documento creado: ${res.filename}\nUbicación: ${res.filePath}\nTamaño: ${res.size || '?'}`;
}

// ── HANDLER PRINCIPAL ─────────────────────────────────────────────────────────
export async function handleCreateDocument(call) {
  const {
    title,
    format = 'pdf',
    sections = [],
    filename,
    savePath,
    author,
    openAfter = true,
  } = call.args || {};

  if (!title) {
    return { success: false, output: 'Necesito el título del documento.' };
  }
  if (!sections || sections.length === 0) {
    return { success: false, output: 'El documento no tiene contenido. Necesito al menos una sección con título y contenido.' };
  }

  _log('info', `create_document: "${title}" formato=${format} secciones=${sections.length}`);

  try {
    const res = await window.electronAPI.createDocument({
      title,
      format: format.toLowerCase(),
      sections,
      filename,
      savePath: _resolveDestPath(savePath),
      author,
      openAfter,
    });

    if (!res.success) {
      return { success: false, output: `No se pudo crear el documento: ${res.error || 'Error desconocido'}` };
    }

    return { success: true, output: _fmtOutput(res) };
  } catch (e) {
    _log('error', `create_document error: ${e.message}`);
    return { success: false, output: `Error al crear el documento: ${e.message}` };
  }
}
