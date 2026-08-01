import { resolvePath } from './PathResolver.js';
import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('DOC_PROCESSOR');

export async function processDocument(path, format) {
  const start = Date.now();

  const resolved = resolvePath(path);
  if (!resolved.success) {
    return Result.withDuration(Result.pathNotFound('process', path), start);
  }

  const perm = await ensurePermittedWithDetails(resolved.resolvedPath, 'read');
  if (!perm.success) return Result.withDuration(perm, start);

  const ext = (format || resolved.resolvedPath.split('.').pop() || '').toLowerCase();
  const filePath = perm.path;

  try {
    const result = await extractByFormat(filePath, ext);
    return Result.withDuration(result, start);
  } catch (e) {
    return Result.withDuration(Result.error('process', 'READ_ERROR', e.message, { path, format: ext }), start);
  }
}

async function extractByFormat(filePath, ext) {
  const q = (p) => "'" + p.replace(/'/g, "''") + "'";

  if (ext === 'txt' || ext === 'text') {
    const r = await window.electronAPI.fileRead(filePath);
    if (!r.success) return Result.error('process', 'READ_ERROR', r.output, { path: filePath });
    return Result.success('process', 'Texto leído.', { extraction: { method: 'text', confidence: 1 }, content: r.output });
  }

  if (ext === 'csv') {
    const r = await window.electronAPI.runPowerShell(
      `Import-Csv -Path ${q(filePath)} -ErrorAction Stop | Format-Table -AutoSize | Out-String -Width 4096`
    );
    if (!r.success) return Result.error('process', 'READ_ERROR', r.output, { path: filePath });
    return Result.success('process', 'CSV procesado.', { extraction: { method: 'csv', confidence: 0.9 }, content: r.output });
  }

  if (ext === 'docx' || ext === 'doc') {
    return await extractDocx(filePath, q);
  }

  if (ext === 'xlsx' || ext === 'xls') {
    return await extractXlsx(filePath, q);
  }

  if (ext === 'pdf') {
    return await extractPdf(filePath, q);
  }

  if (ext === 'zip') {
    return await extractZip(filePath, q);
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
    return await extractImage(filePath, q);
  }

  // Default: read as text
  const r = await window.electronAPI.fileRead(filePath);
  if (r.success) {
    return Result.success('process', 'Archivo leído como texto.', {
      extraction: { method: 'text', confidence: 0.5 },
      content: r.output,
    });
  }

  return Result.error('process', 'FORMAT_NOT_SUPPORTED',
    `No puedo procesar archivos .${ext} todavía.`, { format: ext });
}

async function extractDocx(filePath, q) {
  try {
    const r = await window.electronAPI.runPowerShell(`
      Add-Type -AssemblyName System.IO.Compression;
      $zip=[IO.Compression.ZipFile]::OpenRead(${q(filePath)})
      $e=$zip.Entries|Where-Object{$_.Name -eq 'word/document.xml'}
      if($e){
        $sr=new-object IO.StreamReader($e.Open())
        $xml=[xml]$sr.ReadToEnd()
        $sr.Close()
        $zip.Dispose()
        $text = $xml.document.body.'#text' -join ' '
        if ($text.Length -gt 50000) { $text = $text.Substring(0, 50000) + '... [truncado]' }
        $text
      } else { 'No se pudo extraer texto.'; $zip.Dispose() }
    `);
    return Result.success('process', 'Documento Word procesado.', {
      extraction: { method: 'docx_xml', confidence: r.success ? 0.85 : 0.3 },
      content: r.success ? r.output : 'Extracción parcial.',
    });
  } catch (e) {
    return Result.error('process', 'READ_ERROR', `Error leyendo Word: ${e.message}`, { path: filePath });
  }
}

async function extractXlsx(filePath, q) {
  try {
    const r = await window.electronAPI.runPowerShell(`
      Add-Type -AssemblyName System.IO.Compression;
      $zip=[IO.Compression.ZipFile]::OpenRead(${q(filePath)})
      $e=$zip.Entries|Where-Object{$_.Name -eq 'xl/sharedStrings.xml'}
      if($e){
        $sr=new-object IO.StreamReader($e.Open())
        $xml=[xml]$sr.ReadToEnd()
        $sr.Close()
        $zip.Dispose()
        $texts = $xml.sst.si | ForEach-Object { $_.t }
        $result = $texts -join ' | '
        if ($result.Length -gt 50000) { $result = $result.Substring(0, 50000) + '... [truncado]' }
        $result
      } else { 'No se pudo extraer texto.'; $zip.Dispose() }
    `);
    return Result.success('process', 'Hoja de cálculo procesada.', {
      extraction: { method: 'xlsx_shared_strings', confidence: r.success ? 0.85 : 0.3 },
      content: r.success ? r.output : 'Extracción parcial.',
    });
  } catch (e) {
    return Result.error('process', 'READ_ERROR', `Error leyendo Excel: ${e.message}`, { path: filePath });
  }
}

async function extractPdf(filePath, q) {
  try {
    const r = await window.electronAPI.runPowerShell(`
      Add-Type -AssemblyName System.IO.Compression;
      try {
        $content = Get-Content ${q(filePath)} -Raw -Encoding Byte -TotalCount 100KB;
        $text = [System.Text.Encoding]::UTF8.GetString($content);
        if ($text -match '(?<=stream\\s).*?(?=\\nendstream)') {
          $matches[0].Substring(0, [Math]::Min(50000, $matches[0].Length))
        } else {
          'PDF leído — no se encontró contenido de texto extraíble con这个方法 básico.'
        }
      } catch { 'No se pudo leer el PDF.' }
    `);
    return Result.success('process', 'PDF procesado.', {
      extraction: {
        method: 'pdf_raw',
        confidence: r.success && r.output && !r.output.includes('no se encontró') ? 0.5 : 0.2,
        status: 'partial',
      },
      content: r.success ? r.output : 'No se pudo extraer texto del PDF.',
    });
  } catch (e) {
    return Result.error('process', 'READ_ERROR', `Error leyendo PDF: ${e.message}`, { path: filePath });
  }
}

async function extractZip(filePath, q) {
  try {
    const r = await window.electronAPI.runPowerShell(`
      Add-Type -AssemblyName System.IO.Compression;
      $zip=[IO.Compression.ZipFile]::OpenRead(${q(filePath)})
      $zip.Entries | Select-Object Name, Length | Format-Table -AutoSize | Out-String -Width 4096
      $zip.Dispose()
    `);
    return Result.success('process', 'ZIP procesado.', {
      extraction: { method: 'zip_listing', confidence: 0.9 },
      content: r.success ? r.output : 'No se pudo leer el ZIP.',
    });
  } catch (e) {
    return Result.error('process', 'READ_ERROR', `Error leyendo ZIP: ${e.message}`, { path: filePath });
  }
}

async function extractImage(filePath, q) {
  try {
    const r = await window.electronAPI.runPowerShell(`
      Add-Type -AssemblyName System.Drawing;
      $img = [Drawing.Image]::FromFile(${q(filePath)})
      "Imagen: $($img.Width)x$($img.Height) px, Formato: $($img.RawFormat)"
      $img.Dispose()
    `);
    return Result.success('process', 'Imagen analizada.', {
      extraction: { method: 'image_metadata', confidence: 0.9 },
      content: r.success ? r.output : 'No se pudieron leer los metadatos.',
    });
  } catch (e) {
    return Result.error('process', 'READ_ERROR', `Error leyendo imagen: ${e.message}`, { path: filePath });
  }
}
