import { store } from '../../state/store.js';
import { executePowerShellCommand } from '../../system/powershell.js';
import { changeSystemVolume, changeSystemBrightness } from '../../system/controls.js';
import { launchApp, listInstalledApps, rememberApp, forgetApp, listUserApps } from '../../system/apps.js';
import { searchWeb, openBrowser, fetchUrlContent, analyzePage } from '../web.js';

// File system adapter — reemplaza _normalizePath, _ensurePermitted, y los handlers manuales
import { resolvePath, ensurePermitted, searchFiles, readFile, toLegacyResult } from './adapter-file-system.js';

export async function handlePowerShell(call) {
  const result = await executePowerShellCommand(call.args.command, call.args.description, false);
  return result;
}

export async function handleOpenBrowser(call) {
  return await openBrowser(call.args.url);
}

export async function handleSetVolume(call) {
  return await changeSystemVolume(call.args.percentage);
}

export async function handleGetVolume() {
  try {
    const res = await window.electronAPI.getVolume();
    if (res.success && res.volume !== null) {
      return { success: true, output: `El volumen actual está al ${res.volume}%.` };
    }
    return { success: false, output: 'Hay un inconveniente al obtener el volumen del sistema.' };
  } catch (e) {
    return { success: false, output: 'Hay un inconveniente al obtener el volumen del sistema.' };
  }
}

export async function handleSetBrightness(call) {
  return await changeSystemBrightness(call.args.percentage);
}

export async function handleGetBrightness() {
  try {
    const res = await window.electronAPI.getBrightness();
    if (res.success && res.brightness !== null) {
      return { success: true, output: `El brillo actual está al ${res.brightness}%.` };
    }
    return { success: false, output: 'Hay un inconveniente al obtener el brillo del monitor.' };
  } catch (e) {
    return { success: false, output: 'Hay un inconveniente al obtener el brillo del monitor.' };
  }
}

export async function handleLaunchApp(call) {
  return await launchApp(call.args.appName);
}

export async function handleListInstalledApps(call) {
  const filter = call.args?.filter || call.args?.query || '';
  return await listInstalledApps(filter);
}

export async function handleRememberApp(call) {
  return await rememberApp(call.args.name, call.args.path);
}

export async function handleForgetApp(call) {
  return await forgetApp(call.args.name);
}

export async function handleListUserApps() {
  return await listUserApps();
}

export async function handleSearchWeb(call) {
  const query = call.args.query;
  const engine = call.args.engine || 'auto';
  return await searchWeb(query, engine);
}

export async function handleFetchUrl(call) {
  return await fetchUrlContent(call.args.url);
}

export async function handleAnalyzePage(call) {
  return await analyzePage(call.args.url);
}

export async function handleShowNotification(title, body) {
  try {
    await window.electronAPI.showNotification(title, body);
    return { success: true, output: `Notificación enviada: ${title}` };
  } catch (e) {
    return { success: false, output: `Error en notificación: ${e.message}` };
  }
}

export async function handleGetSystemTime() {
  try {
    const result = await window.electronAPI.getSystemTime();
    if (result.success) {
      const t = result.output;
      return { success: true, output: `${t.dayOfWeek}, ${t.date} — ${t.time} (${t.timezone})` };
    }
    return { success: false, output: 'No se pudo obtener la hora del sistema.' };
  } catch (e) {
    return { success: false, output: `Error: ${e.message}` };
  }
}

export async function handleQuickNote(call, store) {
  const memory = store.get('userMemory');
  if (memory) {
    if (!memory.quickNotes) memory.quickNotes = [];
    memory.quickNotes.push({ text: call.args.note, date: new Date().toISOString() });
    if (memory.quickNotes.length > 50) memory.quickNotes = memory.quickNotes.slice(-50);
    const { default: bus } = await import('../../utils/event-bus.js');
    bus.emit('memory:write-requested', memory);
  }
  return { success: true, output: `Nota guardada: ${(call.args.note || '').substring(0, 100)}` };
}

export async function handleOpenFile(call) {
  const resolved = resolvePath(call.args.path || '');
  if (!resolved.success) return { success: false, output: `Ruta inválida: ${call.args.path}` };
  let path = resolved.resolvedPath;
  if (path.includes('%')) {
    try {
      const r = await window.electronAPI.runPowerShell(
        `[Environment]::ExpandEnvironmentVariables('${path.replace(/'/g, "''")}')`
      );
      if (r.success && r.output) path = r.output.trim();
    } catch {}
  }
  if (!/^[A-Za-z]:[\\/]/.test(path)) {
    const found = await _searchOpenTarget(path);
    if (found.matches.length > 1) {
      return {
        success: false,
        output: `Encontré varias coincidencias para "${call.args.path}":\n${found.matches.join('\n')}\n\nDecime cuál quieres abrir.`,
      };
    }
    if (found.matches.length === 1) path = found.matches[0];
    else return { success: false, output: `No encontré "${call.args.path}" en Documentos, Descargas o Escritorio.` };
  }
  return await window.electronAPI.openPath(path);
}

async function _searchOpenTarget(query) {
  const home = store.get('homeDir') || 'C:\\Users\\Admin';
  const clean = String(query)
    .replace(/^(la|el|las|los|una|un)\s+/i, '')
    .replace(/^(carpeta|directorio|folder|archivo|file|documento)\s+(de\s+|del\s+)?/i, '')
    .trim();
  if (!clean) return { matches: [] };
  const roots = [`${home}\\Documents`, `${home}\\Downloads`, `${home}\\Desktop`];
  const matches = [];
  const cleanL = clean.toLowerCase();
  for (const root of roots) {
    if (matches.length >= 10) break;
    try {
      const r = await window.electronAPI.fileFind(root, `*${clean}*`, 20);
      if (!r.success) continue;
      for (const line of (r.output || '').split('\n')) {
        const isDir = line.startsWith('[DIR]');
        const isFile = line.startsWith('[FILE]');
        if (!isDir && !isFile) continue;
        const full = line.replace(/^\[(DIR|FILE)\]\s+/, '').split(' (')[0].trim();
        if (!full) continue;
        const base = full.split('\\').pop().replace(/\.[^.\/\\]+$/, '').toLowerCase();
        if (isDir && (base === cleanL || full.toLowerCase().endsWith(`\\${cleanL}`))) matches.unshift(full);
        else matches.push(full);
      }
    } catch {}
  }
  return { matches };
}

export async function handleTranslate(call) {
  const text = call.args.text || '';
  const target = call.args.targetLang || 'es';
  if (!text) return { success: false, output: 'No se especificó texto para traducir.' };
  const targetName = { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano', pt: 'portugués', ja: 'japonés', zh: 'chino', ru: 'ruso' }[target] || target;
  return { success: true, output: `[TRADUCCIÓN AL ${targetName.toUpperCase()}]\n${text}\n\nUsa Gemini para traducir este texto al ${targetName}.` };
}

export async function handleListProcesses(call) {
  const action = call.args.action || 'list';
  const name = call.args.name || '';
  const pid = call.args.pid || 0;
  let psCmd = '';
  if (action === 'list') psCmd = `Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name, Id, @{N='CPU(s)';E={[math]::Round($_.CPU,1)}}, @{N='RAM(MB)';E={[math]::Round($_.WorkingSet/1MB,1)}} | Format-Table -AutoSize | Out-String -Width 4096`;
  else if (action === 'filter') psCmd = `Get-Process -Name "${name}" -ErrorAction SilentlyContinue | Select-Object Name, Id, @{N='CPU(s)';E={[math]::Round($_.CPU,1)}}, @{N='RAM(MB)';E={[math]::Round($_.WorkingSet/1MB,1)}} | Format-Table -AutoSize | Out-String -Width 4096`;
  else if (action === 'kill') {
    if (pid) psCmd = `Stop-Process -Id ${pid} -Force -ErrorAction Stop; "Proceso ${pid} finalizado."`;
    else psCmd = `Stop-Process -Name "${name}" -Force -ErrorAction Stop; "Proceso ${name} finalizado."`;
  } else return { success: false, output: `Acción desconocida: ${action}` };
  if (psCmd) return await executePowerShellCommand(psCmd, `process_${action}`);
  return { success: false, output: 'Error en list_processes' };
}

export async function handleSystemStats() {
  const info = await window.electronAPI.getSystemInfo();
  if (!info.success) {
    return { success: false, output: 'No se pudo obtener la información del sistema.' };
  }
  const diskStr = (info.drives || []).map(d => `${d.Drive}: ${d.UsedGB}/${d.TotalGB}GB (${100 - d.PctFree}% usado)`).join(' | ');
  const gpuStr = (info.gpu || []).map(g => g.Name).filter(Boolean).join(', ');
  const parts = [
    `SO: ${info.os.caption || info.os.platform}`,
    `CPU: ${info.cpu.model} (${info.cpu.cores} núcleos)`,
    info.gpu?.length ? `GPU: ${gpuStr}` : null,
    `RAM: ${info.ram.usedGB}GB/${info.ram.totalGB}GB (${info.ram.usedPct}%) | Libre: ${info.ram.freeGB}GB`,
    `Discos: ${diskStr || 'N/A'}`,
    `Uptime: ${info.uptime.days}d ${info.uptime.hours}h ${info.uptime.minutes}m`,
    `Host: ${info.os.hostname}`,
  ].filter(Boolean);
  return { success: true, output: parts.join(' | '), info };
}

export async function handleFindFiles(call) {
  const pattern = call.args.pattern || '';
  let searchPath = call.args.path || '';
  const maxResults = Math.min(call.args.maxResults || 20, 50);
  if (!pattern) return { success: false, output: 'No se especificó patrón de búsqueda.' };

  const result = await searchFiles({
    query: pattern,
    roots: searchPath ? [searchPath] : undefined,
    searchMode: 'name',
    maxResults,
  });

  if (result.success) {
    const items = result.data?.results || [];
    if (items.length === 0) {
      return { success: false, output: `No encontré archivos que coincidan con "${pattern}" en tus carpetas.` };
    }
    const fileList = items.map(r => r.file || r).join('\n');
    return { success: true, output: fileList };
  }

  return { success: false, output: result.message || `No encontré archivos que coincidan con "${pattern}".` };
}

export async function handleCleanSystem(call) {
  const mode = (call.args?.mode || 'analyze') === 'clean' ? 'clean' : 'analyze';
  const script = [
    `[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture`,
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `function Get-DirSizeMB([string]$p) {`,
    `  if (-not (Test-Path -LiteralPath $p)) { return 0 }`,
    `  $sum = (Get-ChildItem -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum`,
    `  if (-not $sum) { return 0 }`,
    `  return [math]::Round($sum / 1MB, 1)`,
    `}`,
    `function Clear-DirContents([string]$p) {`,
    `  if (-not (Test-Path -LiteralPath $p)) { return }`,
    `  Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | ForEach-Object {`,
    `    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue`,
    `  }`,
    `}`,
    `function Get-RecycleBinMB {`,
    `  try {`,
    `    $shell = New-Object -ComObject Shell.Application`,
    `    $sum = ($shell.Namespace(10).Items() | Measure-Object -Property Size -Sum -ErrorAction SilentlyContinue).Sum`,
    `    if (-not $sum) { return 0 }`,
    `    return [math]::Round($sum / 1MB, 1)`,
    `  } catch { return 0 }`,
    `}`,
    `$targets = @(`,
    `  @{ Key = 'temp_user';   Path = $env:TEMP;                     Label = 'Temporales de usuario' },`,
    `  @{ Key = 'temp_system'; Path = "$env:SystemRoot\\Temp";       Label = 'Temporales de Windows' },`,
    `  @{ Key = 'npm_cache';   Path = "$env:LOCALAPPDATA\\npm-cache"; Label = 'Caché de npm' }`,
    `)`,
    `$mode = '${mode}'`,
    `if ($mode -eq 'analyze') {`,
    `  foreach ($t in $targets) {`,
    `    Write-Output ("{0}|{1}|0|{2}" -f $t.Key, (Get-DirSizeMB $t.Path), $t.Label)`,
    `  }`,
    `  Write-Output ("recycle_bin|{0}|0|Papelera de reciclaje" -f (Get-RecycleBinMB))`,
    `} else {`,
    `  foreach ($t in $targets) {`,
    `    $before = Get-DirSizeMB $t.Path`,
    `    Clear-DirContents $t.Path`,
    `    $after = Get-DirSizeMB $t.Path`,
    `    Write-Output ("{0}|{1}|{2}|{3}" -f $t.Key, $before, $after, $t.Label)`,
    `  }`,
    `  $rbBefore = Get-RecycleBinMB`,
    `  Clear-RecycleBin -Force -ErrorAction SilentlyContinue`,
    `  Start-Sleep -Milliseconds 500`,
    `  $rbAfter = Get-RecycleBinMB`,
    `  Write-Output ("recycle_bin|{0}|{1}|Papelera de reciclaje" -f $rbBefore, $rbAfter)`,
    `}`,
  ].join('\n');

  try {
    const res = await window.electronAPI.runPowerShell(script);
    if (!res.success) return { success: false, output: 'No se pudo completar la operación de limpieza del sistema.' };

    const items = (res.output || '')
      .split(/\r?\n/)
      .map(l => {
        const [key, before, after, label] = l.split('|');
        return { key, label: label || key, before: parseFloat(before) || 0, after: parseFloat(after) || 0 };
      })
      .filter(i => i.key && i.before >= 0);

    if (items.length === 0) return { success: false, output: 'No se obtuvo información del sistema para limpiar.' };

    if (mode === 'analyze') {
      const total = items.reduce((s, i) => s + i.before, 0);
      const details = items.map(i => `• ${i.label}: ${i.before.toFixed(1)} MB`).join('\n');
      return { success: true, output: `Espacio recuperable: ~${total.toFixed(1)} MB.\n${details}` };
    }

    const freed = items.reduce((s, i) => s + Math.max(0, i.before - i.after), 0);
    const details = items
      .map(i => {
        const f = Math.max(0, i.before - i.after);
        const inUse = i.after > 0.05 ? ` (${i.after.toFixed(1)} MB en uso, no se tocaron)` : '';
        return `• ${i.label}: ${f.toFixed(1)} MB liberados${inUse}`;
      })
      .join('\n');
    return { success: true, output: `Limpieza completada: ${freed.toFixed(1)} MB liberados.\n${details}` };
  } catch (e) {
    return { success: false, output: `Error en la limpieza del sistema: ${e.message}` };
  }
}
