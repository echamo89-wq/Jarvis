import { ensurePermittedWithDetails } from './FilePermissionManager.js';
import { resolvePath } from './PathResolver.js';
import { getCategory, getCategoryEmoji } from './PathValidator.js';
import * as Result from './FileResult.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('FOLDER_ORGANIZER');

const CATEGORIES = {
  'Imágenes': ['jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff','tif','raw','heic','heif','avif','cr2','nef','arw','dng','orf'],
  'Videos': ['mp4','mkv','avi','mov','wmv','flv','webm','m4v','3gp','ts','vob','mpg','mpeg','rmvb','divx','m2ts'],
  'Música': ['mp3','wav','flac','aac','ogg','m4a','wma','opus','aiff','ape','mid','midi'],
  'Documentos': ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','odt','ods','odp','csv','md','epub','mobi'],
  'Comprimidos': ['zip','rar','7z','tar','gz','bz2','xz','z','cab','lzh','jar'],
  'Instaladores': ['exe','msi','msix','appx','appxbundle','iso','img'],
  'Código': ['js','ts','jsx','tsx','py','cs','cpp','c','h','java','go','rs','php','html','css','scss','json','xml','yaml','yml','sql','sh','ps1','bat','cmd','lua','rb','swift','kt','mjs','cjs','htm','sass','less','toml','ini','cfg','conf','env','log'],
  'Minecraft': ['mcworld','mcpack','mcaddon','mctemplate','mcfunction'],
};

export async function preview(folderPath) {
  const start = Date.now();
  const perm = await ensurePermittedWithDetails(folderPath, 'list');
  if (!perm.success) return Result.withDuration(perm, start);

  const resolved = resolvePath(folderPath);
  if (!resolved.success) return Result.withDuration(Result.pathNotFound('organize_preview', folderPath), start);

  try {
    const script = buildPreviewScript(resolved.resolvedPath);
    const r = await window.electronAPI.runPowerShell(script);
    const out = (r?.output || '').trim();

    if (!out) return Result.withDuration(Result.error('organize_preview', 'READ_ERROR', 'PowerShell no respondió.', {}), start);
    if (out.startsWith('ERROR:')) return Result.withDuration(Result.error('organize_preview', 'PATH_NOT_FOUND', out.slice(6), {}), start);
    if (out === 'EMPTY') return Result.withDuration(Result.success('organize_preview', `La carpeta ya está limpia.`, { total: 0, categories: {} }), start);

    if (out.startsWith('PREVIEW')) {
      const ps = out.split('|');
      const total = parseInt(ps[1]) || 0;
      const cats = {};
      ps.slice(2).forEach(p => {
        const [cat, count] = p.split(':');
        cats[cat] = parseInt(count) || 0;
      });
      return Result.withDuration(Result.success('organize_preview', `Vista previa: ${total} archivos en ${Object.keys(cats).length} categorías.`, {
        total,
        categories: cats,
      }), start);
    }

    return Result.withDuration(Result.success('organize_preview', out, {}), start);
  } catch (e) {
    return Result.withDuration(Result.error('organize_preview', 'UNKNOWN_ERROR', e.message, {}), start);
  }
}

export async function execute(folderPath) {
  const start = Date.now();
  const perm = await ensurePermittedWithDetails(folderPath, 'organize');
  if (!perm.success) return Result.withDuration(perm, start);

  const resolved = resolvePath(folderPath);
  if (!resolved.success) return Result.withDuration(Result.pathNotFound('organize_execute', folderPath), start);

  try {
    const script = buildExecuteScript(resolved.resolvedPath);
    const r = await window.electronAPI.runPowerShell(script);
    const out = (r?.output || '').trim();

    if (!out) return Result.withDuration(Result.error('organize_execute', 'READ_ERROR', 'PowerShell no respondió.', {}), start);
    if (out.startsWith('ERROR:')) return Result.withDuration(Result.error('organize_execute', 'PATH_NOT_FOUND', out.slice(6), {}), start);

    if (out.startsWith('DONE')) {
      const ps = out.split('|');
      const moved = parseInt(ps[1]) || 0;
      const skipped = parseInt(ps[2]) || 0;
      const errors = parseInt(ps[3]) || 0;
      const cats = {};
      ps.slice(4).forEach(p => {
        const [cat, count] = p.split(':');
        cats[cat] = parseInt(count) || 0;
      });
      return Result.withDuration(Result.success('organize_execute', `Organización completada: ${moved} archivos movidos.`, {
        moved, skipped, errors, categories: cats,
      }), start);
    }

    return Result.withDuration(Result.success('organize_execute', out, {}), start);
  } catch (e) {
    return Result.withDuration(Result.error('organize_execute', 'UNKNOWN_ERROR', e.message, {}), start);
  }
}

export async function undo(folderPath) {
  const start = Date.now();
  const resolved = resolvePath(folderPath);
  if (!resolved.success) return Result.withDuration(Result.pathNotFound('organize_undo', folderPath), start);

  try {
    const script = buildUndoScript(resolved.resolvedPath);
    const r = await window.electronAPI.runPowerShell(script);
    const out = (r?.output || '').trim();

    if (!out) return Result.withDuration(Result.error('organize_undo', 'READ_ERROR', 'PowerShell no respondió.', {}), start);
    if (out.startsWith('ERROR:')) return Result.withDuration(Result.error('organize_undo', 'OPERATION_FAILED', out.slice(6), {}), start);

    if (out.startsWith('UNDO')) {
      const ps = out.split('|');
      const restored = parseInt(ps[1]) || 0;
      const errors = parseInt(ps[2]) || 0;
      return Result.withDuration(Result.success('organize_undo', `Organización deshecha: ${restored} archivos restaurados.`, {
        restored, errors,
      }), start);
    }

    return Result.withDuration(Result.success('organize_undo', out, {}), start);
  } catch (e) {
    return Result.withDuration(Result.error('organize_undo', 'UNKNOWN_ERROR', e.message, {}), start);
  }
}

function resolveSentinel(fp, home) {
  let r = fp;
  const known = {
    '__DOWNLOADS__': home + '\\Downloads',
    '__DESKTOP__': home + '\\Desktop',
    '__DOCUMENTS__': home + '\\Documents',
    '__MUSIC__': home + '\\Music',
    '__VIDEOS__': home + '\\Videos',
    '__PICTURES__': home + '\\Pictures',
    '__USERPROFILE__': home,
  };
  for (const [key, val] of Object.entries(known)) {
    if (r.includes(key)) return r.replace(key, val);
  }
  return r;
}

function buildPreviewScript(fp) {
  const safe = fp.replace(/'/g, "''");
  const catDefs = Object.entries(CATEGORIES).map(([name, exts]) =>
    `  '${name}' = @(${exts.map(e => `'${e}'`).join(',')})`
  ).join('\n');
  return [
    `$folderPath = '${safe}'`,
    `if (-not (Test-Path $folderPath)) { Write-Output "ERROR:La carpeta no existe: $folderPath"; exit }`,
    `$categories = @{`,
    catDefs,
    `}`,
    `$files = [System.IO.Directory]::GetFiles($folderPath)`,
    `$total = $files.Count`,
    `if ($total -eq 0) { Write-Output "EMPTY"; exit }`,
    `$grouped = @{}`,
    `foreach ($file in $files) {`,
    `  $ext = [System.IO.Path]::GetExtension($file).TrimStart('.').ToLower()`,
    `  $cat = 'Otros'`,
    `  foreach ($key in $categories.Keys) { if ($categories[$key] -contains $ext) { $cat = $key; break } }`,
    `  if (-not $grouped.ContainsKey($cat)) { $grouped[$cat] = 0 }`,
    `  $grouped[$cat]++`,
    `}`,
    '$result = "PREVIEW|$total"',
    'foreach ($cat in ($grouped.Keys | Sort-Object)) { $result += "|${cat}:$($grouped[$cat])" }',
    'Write-Output $result',
  ].join('\n');
}

function buildExecuteScript(fp) {
  const safe = fp.replace(/'/g, "''");
  const catDefs = Object.entries(CATEGORIES).map(([name, exts]) =>
    `  '${name}' = @(${exts.map(e => `'${e}'`).join(',')})`
  ).join('\n');
  return [
    `$folderPath = '${safe}'`,
    `if (-not (Test-Path $folderPath)) { Write-Output "ERROR:La carpeta no existe: $folderPath"; exit }`,
    `$categories = @{`,
    catDefs,
    `}`,
    `$logPath = Join-Path $folderPath '_jarvis_organizer_undo.json'`,
    `$log = @(); $moved = 0; $skipped = 0; $errors = 0`,
    `$files = Get-ChildItem -Path $folderPath -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '_jarvis_organizer_undo.json' }`,
    `foreach ($file in $files) {`,
    `  $ext = $file.Extension.TrimStart('.').ToLower()`,
    `  $cat = 'Otros'`,
    `  foreach ($key in $categories.Keys) { if ($categories[$key] -contains $ext) { $cat = $key; break } }`,
    `  $destDir = Join-Path $folderPath $cat`,
    `  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }`,
    `  $destFile = Join-Path $destDir $file.Name`,
    `  if (Test-Path $destFile) {`,
    `    $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name); $ext2 = $file.Extension; $counter = 1`,
    '    do { $destFile = Join-Path $destDir "${base}_${counter}${ext2}"; $counter++ } while (Test-Path $destFile)',
    `  }`,
    `  try { Move-Item -Path $file.FullName -Destination $destFile -Force; $log += @{ src = $destFile; dst = $file.FullName }; $moved++ } catch { $errors++; $skipped++ }`,
    `}`,
    `$log | ConvertTo-Json -Depth 3 | Set-Content -Path $logPath -Encoding UTF8`,
    `$catStats = @{}`,
    `foreach ($f in (Get-ChildItem -Path $folderPath -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '_jarvis_organizer_undo.json' })) {`,
    `  $parent = $f.Directory.Name`,
    `  if (-not $catStats.ContainsKey($parent)) { $catStats[$parent] = 0 }`,
    `  $catStats[$parent]++`,
    `}`,
    '$result = "DONE|$moved|$skipped|$errors"',
    'foreach ($cat in ($catStats.Keys | Sort-Object)) { $result += "|${cat}:$($catStats[$cat])" }',
    'Write-Output $result',
  ].join('\n');
}

function buildUndoScript(fp) {
  const safe = fp.replace(/'/g, "''");
  return [
    `$folderPath = '${safe}'`,
    `$logPath = Join-Path $folderPath '_jarvis_organizer_undo.json'`,
    `if (-not (Test-Path $logPath)) { Write-Output "ERROR:No hay registro de organización para deshacer en esta carpeta."; exit }`,
    `try { $log = Get-Content -Path $logPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { Write-Output "ERROR:No se pudo leer el registro."; exit }`,
    `$restored = 0; $errors = 0`,
    `foreach ($entry in $log) {`,
    `  try {`,
    `    if (Test-Path $entry.src) {`,
    `      $destDir = Split-Path $entry.dst -Parent`,
    `      if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }`,
    `      Move-Item -Path $entry.src -Destination $entry.dst -Force; $restored++`,
    `    }`,
    `  } catch { $errors++ }`,
    `}`,
    `Get-ChildItem -Path $folderPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {`,
    `  if ((Get-ChildItem -Path $_.FullName -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue }`,
    `}`,
    `Remove-Item -Path $logPath -Force -ErrorAction SilentlyContinue`,
    `Write-Output "UNDO|$restored|$errors"`,
  ].join('\n');
}
