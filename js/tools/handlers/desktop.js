import { store } from '../../state/store.js';
import { executePowerShellCommand } from '../../system/powershell.js';
import { addLocalReminder } from '../../system/reminders.js';

// File system adapter
import { execute, toLegacyResult, toLegacyWithData, processDocument } from './adapter-file-system.js';

export async function handleFileOperation(call) {
  const op = call.args.operation || '';
  const opts = call.args;
  const path = opts.path || '';

  // Map legacy operations to new system
  const opMap = {
    list: 'list',
    summary: 'summary',
    read: 'read',
    write: 'write',
    delete: 'delete',
    delete_folder: 'delete_folder',
    info: 'inspect',
    media: 'search_media',
    multimedia: 'search_media',
    move: 'move',
    copy: 'copy',
    find: 'search',
    search: 'search',
    folder: 'search',
    find_folder: 'search',
    inspect: 'inspect',
  };

  const newOp = opMap[op];
  if (!newOp) return { success: false, output: `Operación desconocida: ${op}` };

  if (op === 'folder' || op === 'find_folder') {
    const result = await execute({ operation: 'search', args: { query: opts.pattern || '*', roots: [path], searchMode: 'folder', maxResults: opts.maxResults || 30 } });
    if (!result.success) return toLegacyResult(result);
    const items = result.data?.results || [];
    if (items.length === 0) return { success: true, output: `No se encontraron carpetas con "${opts.pattern || '*'}" en ${path}` };
    return { success: true, output: `📁 ${items.length} carpeta(s) encontradas:\n${items.map(r => r.file || r).join('\n')}` };
  }

  if (op === 'media' || op === 'multimedia') {
    const result = await execute({ operation: 'search_media', args: { path, mediaType: opts.mediaType || opts.type || 'all', maxResults: opts.maxResults } });
    return toLegacyWithData(result);
  }

  if (op === 'move' || op === 'copy') {
    const result = await execute({ operation: op, args: { path, destination: opts.destination } });
    return toLegacyResult(result);
  }

  const result = await execute({ operation: newOp, args: { path, content: opts.content, pattern: opts.pattern, maxResults: opts.maxResults } });
  return toLegacyResult(result);
}

export async function handleComputerAction(call) {
  const action = call.args.action || '';
  const keys = call.args.keys || '';
  const windowTitle = call.args.windowTitle || '';
  let psCmd = '';
  if (action === 'type_text') {
    const escaped = keys.replace(/["$`]/g, '`$&').replace(/~/g, '~~').replace(/\+/g, '{+}').replace(/\^/g, '{^}').replace(/%/g, '{%}');
    psCmd = `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("${escaped}")`;
  } else if (action === 'press_keys') {
    const escaped = keys.replace(/["$`]/g, '`$&');
    psCmd = `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("${escaped}")`;
  } else if (action === 'clipboard_get') {
    psCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()`;
  } else if (action === 'clipboard_set') {
    const escaped = keys.replace(/'/g, "''");
    psCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('${escaped}'); "Texto copiado al portapapeles."`;
  } else if (action === 'focus_window') {
    const safeTitle = windowTitle.replace(/[;&|$()`']/g, '');
    psCmd = `(Get-Process | Where-Object { $_.MainWindowTitle -match '${safeTitle}' }).MainWindowHandle | ForEach-Object { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'; [Win32]::SetForegroundWindow($_) }; '${safeTitle} enfocado.'`;
  } else if (action === 'screenshot') {
    psCmd = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $s=[Windows.Forms.Screen]::PrimaryScreen.Bounds; $b=New-Object Drawing.Bitmap($s.Width,$s.Height); $g=[Drawing.Graphics]::FromImage($b); $g.CopyFromScreen($s.Location,[Drawing.Point]::Empty,$s.Size); $p="$env:USERPROFILE\\Desktop\\JARVIS_ss_$(Get-Date -f yyyyMMdd_HHmmss).png"; $b.Save($p); $g.Dispose(); $b.Dispose(); "Captura: $p"`;
  } else return { success: false, output: `Acción desconocida: ${action}` };

  if (psCmd) return await executePowerShellCommand(psCmd, `computer_${action}`);
  return { success: false, output: 'Error en computer_action' };
}

export async function handleDesktopAction(call) {
  const action = call.args.action || '';
  const value = call.args.value || '';
  let psCmd = '';
  if (action === 'wallpaper') {
    if (!value) return { success: false, output: 'Se requiere URL de imagen o color.' };
    if (value.startsWith('#')) {
      const hex = value.replace('#', '');
      const r = parseInt(hex.substring(0,2), 16);
      const g = parseInt(hex.substring(2,4), 16);
      const b = parseInt(hex.substring(4,6), 16);
      return await window.electronAPI.setWallpaper('color', `${r} ${g} ${b}`);
    } else {
      return await window.electronAPI.setWallpaper('url', value);
    }
  } else if (action === 'organize' || action === 'clean') {
    return { success: true, output: `Función "${action}" requiere PowerShell con permisos elevados. Pronto disponible.` };
  } else if (action === 'stats') {
    psCmd = `$os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor; $disk=Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'; $proc=@($cpu).Count; $cores=@($cpu|Select-Object -ExpandProperty NumberOfCores) -join '+'; $ramTotal=[Math]::Round($os.TotalVisibleMemorySize/1MB,2); $ramFree=[Math]::Round($os.FreePhysicalMemory/1MB,2); $ramUsed=[Math]::Round($ramTotal-$ramFree,2); $diskInfo=$disk|ForEach-Object{($_.DeviceID)+' ' +[Math]::Round($_.Size/1GB,2)+'GB Total, '+[Math]::Round($_.FreeSpace/1GB,2)+'GB Libre'}; $uptime=(Get-Date)-$os.LastBootUpTime; 'CPU: '+$proc+' procesadores, '+$cores+' n'+[char]250+'cleos | RAM: '+$ramUsed+'GB usada / '+$ramTotal+'GB total | Libre: '+$ramFree+'GB | Discos: '+($diskInfo -join '; ')+' | Uptime: '+$uptime.Days+'d '+$uptime.Hours+'h '+$uptime.Minutes+'m | SO: '+$os.Caption`;
  } else return { success: false, output: `Acción desktop desconocida: ${action}` };

  if (psCmd) return await executePowerShellCommand(psCmd, `desktop_${action}`);
  return { success: false, output: 'Error en desktop_action' };
}

export async function handleSetReminder(call) {
  const reminder = (call.args.reminder || '').replace(/[;&|$()`]/g, '').trim();
  const time = call.args.time || '';
  if (!reminder || !time) return { success: false, output: 'Se requiere texto y hora del recordatorio.' };

  const now = new Date();
  let targetDate = null;

  // Parseo de hora flexible (español e inglés)
  const inMatch = time.match(/(?:en|in)\s+(\d+)\s+(minuto|minutos|minute|minutes|min|hora|horas|hour|hours)/i);
  const atMatch = time.match(/(?:a las?|at)\s+(\d{1,2})(?:[:h](\d{2})?)?(?:\s*(am|pm))?/i);
  const tomorrowAt = time.match(/(?:mañana|tomorrow)(?:\s+a las?|\s+at)?\s+(\d{1,2})(?:[:h](\d{2})?)?/i);
  const inXMin = time.match(/(\d+)\s+(minuto|min|minutos|minutes)/i);
  const inXHour = time.match(/(\d+)\s+(hora|hour|horas|hours)/i);

  if (time.match(/ahora|now/i)) {
    targetDate = new Date(now.getTime() + 60000);
  } else if (inMatch) {
    const n = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    targetDate = (unit.startsWith('hora') || unit.startsWith('hour'))
      ? new Date(now.getTime() + n * 3600000)
      : new Date(now.getTime() + n * 60000);
  } else if (inXHour) {
    targetDate = new Date(now.getTime() + parseInt(inXHour[1]) * 3600000);
  } else if (inXMin) {
    targetDate = new Date(now.getTime() + parseInt(inXMin[1]) * 60000);
  } else if (tomorrowAt) {
    const h = parseInt(tomorrowAt[1]);
    const m = parseInt(tomorrowAt[2] || '0');
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m);
  } else if (atMatch) {
    let h = parseInt(atMatch[1]);
    const m = parseInt(atMatch[2] || '0');
    const ampm = (atMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    if (targetDate <= now) targetDate.setDate(targetDate.getDate() + 1);
  } else {
    try { targetDate = new Date(time); } catch (e) {}
  }

  if (!targetDate || isNaN(targetDate.getTime())) {
    return { success: false, output: `No pude entender la hora: "${time}". Di por ejemplo: "en 30 minutos", "a las 18:00", "mañana a las 9".` };
  }
  if (targetDate.getTime() - now.getTime() < 30000) {
    targetDate = new Date(now.getTime() + 30000);
  }

  const formattedTarget = targetDate.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });

  // Guardar localmente (sin PowerShell ni Defender)
  const newReminder = addLocalReminder(reminder, targetDate);

  return {
    success: true,
    output: `⏰ Recordatorio guardado: "${reminder}" para el ${formattedTarget}. Te avisaré con una alerta en pantalla cuando llegue el momento.`
  };
}

const _activeTimers = new Map();

export async function handleSetTimer(call) {
  const label = (call.args.label || 'Temporizador').replace(/[;&|$()`]/g, '').trim();
  const duration = parseInt(call.args.duration || 0, 10);
  if (isNaN(duration) || duration <= 0) return { success: false, output: 'La duración debe ser mayor a 0 segundos.' };

  // Disparar en segundo plano sin bloquear la respuesta
  const timerId = setTimeout(async () => {
    try {
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification('⏰ Temporizador JARVIS', `¡El temporizador "${label}" ha terminado!`);
      }
    } catch (e) {
      _log('error', `Error en temporizador "${label}": ${e.message}`);
    }
  }, duration * 1000);

  _activeTimers.set(`${label}_${Date.now()}`, timerId);

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const timeText = mins > 0 ? `${mins} min${secs > 0 ? ` ${secs}s` : ''}` : `${secs}s`;

  return {
    success: true,
    output: `⏰ Temporizador "${label}" configurado para ${timeText}. Te avisaré apenas termine.`
  };
}

export async function handleProcessFile(call) {
  const path = call.args.path || '';
  const format = call.args.format || '';
  if (!path) return { success: false, output: 'No se especificó ruta de archivo.' };

  const result = await processDocument(path, format);
  return {
    success: result.success,
    output: result.data?.content || result.message || (result.success ? 'Archivo procesado.' : 'Error al procesar.'),
  };
}
