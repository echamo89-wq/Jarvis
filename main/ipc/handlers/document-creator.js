/**
 * document-creator.js — IPC handler para create_document
 * Genera archivos de cualquier tipo desde el proceso principal de Electron.
 * PDF: usa BrowserWindow.printToPDF() — sin dependencias externas.
 * DOCX: genera RTF estructurado (Word lo abre nativo).
 * TXT / MD / HTML / CSV / JSON: escritura directa con fs.
 */
const { ipcMain, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Resolver carpeta destino ───────────────────────────────────────────────────
function _resolveSavePath(savePath) {
  const home = os.homedir();
  if (!savePath || savePath.toLowerCase() === 'desktop' || savePath === 'Escritorio') {
    return path.join(home, 'Desktop');
  }
  if (savePath.toLowerCase() === 'documents' || savePath === 'Documentos') {
    return path.join(home, 'Documents');
  }
  if (savePath.toLowerCase() === 'downloads' || savePath === 'Descargas') {
    return path.join(home, 'Downloads');
  }
  // Ruta absoluta
  if (path.isAbsolute(savePath)) return savePath;
  return path.join(home, 'Desktop');
}

// ── Sanitizar nombre de archivo ───────────────────────────────────────────────
function _safeName(name) {
  return (name || 'documento').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 120);
}

// ── Formato de tamaño ──────────────────────────────────────────────────────────
function _fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERADORES DE CONTENIDO POR FORMATO
// ══════════════════════════════════════════════════════════════════════════════

// ── HTML → PDF con printToPDF ─────────────────────────────────────────────────
function _buildPdfHtml(title, sections, author) {
  const dateStr = new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' });
  const sectionsHtml = sections.map((s, i) => `
    <div class="section">
      <h2>${i + 1}. ${s.title || `Sección ${i + 1}`}</h2>
      ${(s.content || '').split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
    </div>
  `).join('<div class="page-break"></div>');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a2e;
    background: #fff;
  }
  .cover {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 80px 60px;
    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
    color: #fff;
    page-break-after: always;
  }
  .cover .label {
    font-size: 9pt;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #a78bfa;
    margin-bottom: 24px;
  }
  .cover h1 {
    font-size: 32pt;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 20px;
  }
  .cover .meta {
    font-size: 10pt;
    color: rgba(255,255,255,0.6);
    margin-top: 40px;
  }
  .cover .accent-line {
    width: 60px;
    height: 4px;
    background: #a78bfa;
    margin-bottom: 24px;
    border-radius: 2px;
  }
  .content {
    padding: 60px 70px;
    max-width: 800px;
    margin: 0 auto;
  }
  .section { margin-bottom: 40px; }
  h2 {
    font-size: 16pt;
    font-weight: 700;
    color: #302b63;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e9e5ff;
  }
  p {
    margin-bottom: 12px;
    color: #2d2d2d;
    text-align: justify;
  }
  .page-break { page-break-before: always; height: 0; }
  .footer {
    text-align: center;
    font-size: 8pt;
    color: #888;
    padding: 20px;
    border-top: 1px solid #eee;
    margin-top: 60px;
  }
  @page {
    margin: 20mm 25mm;
  }
  @page :first { margin: 0; }
  @media print {
    .cover { min-height: 100vh; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="label">Documento</div>
    <div class="accent-line"></div>
    <h1>${title}</h1>
    <div class="meta">
      ${author ? `Preparado por: ${author}<br>` : ''}
      Fecha: ${dateStr}
    </div>
  </div>
  <div class="content">
    ${sectionsHtml}
    <div class="footer">
      ${title} — ${dateStr}${author ? ' — ' + author : ''}
    </div>
  </div>
</body>
</html>`;
}

async function _generatePdf(filePath, title, sections, author) {
  const html = _buildPdfHtml(title, sections, author);
  const tmpHtml = path.join(os.tmpdir(), `jarvis_doc_${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  try {
    await win.loadFile(tmpHtml);
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok: true };
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmpHtml); } catch {}
  }
}

// ── RTF (Word-compatible) ─────────────────────────────────────────────────────
function _generateRtf(title, sections) {
  const _rtfEsc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    .replace(/[^\x00-\x7F]/g, c => `\\u${c.charCodeAt(0)}?`);

  const body = sections.map((s, i) => {
    const hdr = `\\pard\\sb360\\sa120\\b\\fs28 ${_rtfEsc(`${i + 1}. ${s.title || `Sección ${i + 1}`}`)}\\b0\\par`;
    const lines = (s.content || '').split('\n')
      .map(l => l.trim() ? `\\pard\\sa120\\fs22 ${_rtfEsc(l)}\\par` : '\\par')
      .join('\n');
    return hdr + '\n' + lines + '\n\\page\n';
  }).join('');

  return `{\\rtf1\\ansi\\ansicpg1252\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl ;\\red48\\green43\\blue99;}
\\deflang3082\\widowctrl
{\\pard\\qc\\sb720\\sa360\\b\\fs40\\f1\\cf1 ${_rtfEsc(title)}\\b0\\par}
{\\pard\\qc\\sa240\\fs20\\f1 ${new Date().toLocaleDateString('es-PY')}\\par}
\\page
${body}
}`;
}

// ── HTML limpio ───────────────────────────────────────────────────────────────
function _generateHtml(title, sections) {
  const sects = sections.map((s, i) => `
  <section>
    <h2>${i + 1}. ${s.title || `Sección ${i + 1}`}</h2>
    ${(s.content || '').split('\n').filter(p => p.trim()).map(p => `    <p>${p}</p>`).join('\n')}
  </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 24px; color: #222; line-height: 1.7; }
  h1 { color: #302b63; border-bottom: 3px solid #a78bfa; padding-bottom: 12px; }
  h2 { color: #302b63; margin-top: 40px; }
  p { margin-bottom: 10px; }
</style>
</head>
<body>
<h1>${title}</h1>
<p><em>${new Date().toLocaleDateString('es-PY')}</em></p>
${sects}
</body>
</html>`;
}

// ── Markdown ──────────────────────────────────────────────────────────────────
function _generateMd(title, sections) {
  const lines = [`# ${title}`, ``, `*Fecha: ${new Date().toLocaleDateString('es-PY')}*`, ``];
  sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title || `Sección ${i + 1}`}`, ``);
    (s.content || '').split('\n').forEach(p => { if (p.trim()) lines.push(p); });
    lines.push('');
  });
  return lines.join('\n');
}

// ── Texto plano ───────────────────────────────────────────────────────────────
function _generateTxt(title, sections) {
  const sep = '═'.repeat(60);
  const lines = [sep, title.toUpperCase(), sep, '', `Fecha: ${new Date().toLocaleDateString('es-PY')}`, ''];
  sections.forEach((s, i) => {
    lines.push(`${i + 1}. ${(s.title || `Sección ${i + 1}`).toUpperCase()}`, '─'.repeat(40), '');
    (s.content || '').split('\n').forEach(p => { if (p.trim()) lines.push(p); });
    lines.push('', '');
  });
  return lines.join('\n');
}

// ── CSV ───────────────────────────────────────────────────────────────────────
function _generateCsv(title, sections) {
  const escape = (v) => `"${(v || '').replace(/"/g, '""')}"`;
  const rows = [['Sección', 'Título', 'Contenido']];
  sections.forEach((s, i) => rows.push([`${i + 1}`, s.title || '', s.content || '']));
  return rows.map(r => r.map(escape).join(',')).join('\r\n');
}

// ── JSON ──────────────────────────────────────────────────────────────────────
function _generateJson(title, sections) {
  return JSON.stringify({ title, date: new Date().toISOString(), sections }, null, 2);
}

// ══════════════════════════════════════════════════════════════════════════════
// HANDLER IPC PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
function registerDocumentCreator() {
  ipcMain.handle('create-document', async (event, args) => {
    try {
      const {
        title = 'Documento',
        format = 'pdf',
        sections = [],
        filename,
        savePath,
        author,
        openAfter = true,
      } = args;

      const saveDir = _resolveSavePath(savePath);
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      const ext = format.toLowerCase().replace(/^\./, '');
      const baseName = _safeName(filename || title);
      const fullName = baseName.endsWith('.' + ext) ? baseName : `${baseName}.${ext}`;
      const filePath = path.join(saveDir, fullName);

      if (ext === 'pdf') {
        await _generatePdf(filePath, title, sections, author);
      } else if (ext === 'docx' || ext === 'doc' || ext === 'rtf' || ext === 'word') {
        const actualExt = 'rtf';
        const rtfPath = filePath.replace(/\.(docx?|word)$/i, '.rtf');
        fs.writeFileSync(rtfPath, _generateRtf(title, sections), 'latin1');
        if (openAfter) shell.openPath(rtfPath);
        const stat = fs.statSync(rtfPath);
        return { success: true, filePath: rtfPath, filename: path.basename(rtfPath), size: _fmtSize(stat.size), format: 'rtf' };
      } else if (ext === 'html' || ext === 'htm') {
        fs.writeFileSync(filePath, _generateHtml(title, sections), 'utf8');
      } else if (ext === 'md' || ext === 'markdown') {
        fs.writeFileSync(filePath, _generateMd(title, sections), 'utf8');
      } else if (ext === 'csv') {
        fs.writeFileSync(filePath, _generateCsv(title, sections), 'utf8');
      } else if (ext === 'json') {
        fs.writeFileSync(filePath, _generateJson(title, sections), 'utf8');
      } else {
        // Default: texto plano
        fs.writeFileSync(filePath, _generateTxt(title, sections), 'utf8');
      }

      if (openAfter && fs.existsSync(filePath)) shell.openPath(filePath);
      const stat = fs.statSync(filePath);
      return { success: true, filePath, filename: fullName, size: _fmtSize(stat.size), format: ext };
    } catch (err) {
      console.error('[DOC-CREATOR]', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerDocumentCreator };
