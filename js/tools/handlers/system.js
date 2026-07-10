import { executePowerShellCommand } from '../../system/powershell.js';
import { changeSystemVolume, changeSystemBrightness } from '../../system/controls.js';
import { launchApp } from '../../system/apps.js';
import { searchWeb, openBrowser, fetchUrlContent } from '../web.js';

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

export async function handleSetBrightness(call) {
  return await changeSystemBrightness(call.args.percentage);
}

export async function handleLaunchApp(call) {
  return await launchApp(call.args.appName);
}

export async function handleSearchWeb(call) {
  const query = call.args.query;
  const engine = call.args.engine || 'auto';
  return await searchWeb(query, engine);
}

export async function handleFetchUrl(call) {
  return await fetchUrlContent(call.args.url);
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
  return await window.electronAPI.openPath(call.args.path);
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
  const psCmd = `$os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor; $disk=Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'; $proc=@($cpu).Count; $cores=@($cpu|Select-Object -ExpandProperty NumberOfCores) -join '+'; $ramTotal=[Math]::Round($os.TotalVisibleMemorySize/1MB,2); $ramFree=[Math]::Round($os.FreePhysicalMemory/1MB,2); $ramUsed=[Math]::Round($ramTotal-$ramFree,2); $diskInfo=$disk|ForEach-Object{($_.DeviceID)+' '+[Math]::Round($_.Size/1GB,2)+'GB Total, '+[Math]::Round($_.FreeSpace/1GB,2)+'GB Libre'}; $uptime=(Get-Date)-$os.LastBootUpTime; $pct=Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average; 'CPU: '+$pct+'% | RAM: '+$ramUsed+'GB/'+$ramTotal+'GB ('+[math]::Round($ramUsed/$ramTotal*100,0)+'%) | Libre: '+$ramFree+'GB | Discos: '+($diskInfo -join ' | ')+' | Uptime: '+$uptime.Days+'d '+$uptime.Hours+'h '+$uptime.Minutes+'m | SO: '+$os.Caption`;
  return await executePowerShellCommand(psCmd, 'system_stats');
}

export async function handleFindFiles(call) {
  const pattern = call.args.pattern || '';
  const searchPath = call.args.path || window.electronAPI?.getHomeDir?.() || 'C:\\Users\\Admin\\Desktop';
  const maxResults = Math.min(call.args.maxResults || 20, 50);
  if (!pattern) return { success: false, output: 'No se especificó patrón de búsqueda.' };
  try {
    const result = await window.electronAPI.fileFind(searchPath, pattern, maxResults);
    if (!result) return { success: false, output: 'Sin respuesta del sistema de búsqueda.' };
    if (result.success && result.output.includes('No se encontraron')) return result;
    return result;
  } catch (err) {
    return { success: false, output: `Error de búsqueda: ${err.message}` };
  }
}
