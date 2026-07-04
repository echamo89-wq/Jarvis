import { executePowerShellCommand } from '../../system/powershell.js';
import { fetchUrlContent } from '../web.js';

async function _safeReadFile(path) {
  return await window.electronAPI.fileRead(path);
}

async function _safeWriteFile(path, content) {
  return await window.electronAPI.fileWrite(path, content);
}

async function _safeDeleteFile(path) {
  return await window.electronAPI.fileDelete(path);
}

async function _safeListDir(path, pattern) {
  return await window.electronAPI.fileList(path, pattern || '');
}

async function _safeFileInfo(path) {
  return await window.electronAPI.fileInfo(path);
}

export async function handleFileOperation(call) {
  const op = call.args.operation || '';
  let path = call.args.path || '';
  const content = call.args.content || '';
  const dest = call.args.destination || '';
  const pattern = call.args.pattern || '';
  const actualHome = window.electronAPI?.getHomeDir?.() || 'C:\\Users\\Admin';
  path = path.replace(/C:\\Users\\[^\\]+/i, actualHome);

  if (op === 'list') return await _safeListDir(path, pattern);
  if (op === 'read') return await _safeReadFile(path);
  if (op === 'write') return await _safeWriteFile(path, content);
  if (op === 'delete') return await _safeDeleteFile(path);
  if (op === 'info') return await _safeFileInfo(path);
  if (op === 'move' || op === 'copy') {
    const actualHome = window.electronAPI?.getHomeDir?.() || 'C:\\Users\\Admin';
    const src = path.replace(/C:\\Users\\[^\\]+/i, actualHome);
    const dst = dest.replace(/C:\\Users\\[^\\]+/i, actualHome);
    try {
      const srcContent = await _safeReadFile(src);
      if (!srcContent.success) return srcContent;
      const wrote = await _safeWriteFile(dst + (dest.endsWith('\\') ? path.split('\\').pop() : ''), srcContent.output);
      if (!wrote.success) return wrote;
      if (op === 'move') await _safeDeleteFile(src);
      return { success: true, output: `${op === 'move' ? 'Movido' : 'Copiado'}: ${src} → ${dst}` };
    } catch (e) {
      return { success: false, output: `Error en ${op}: ${e.message}` };
    }
  }
  if (op === 'find') {
    const psCmd = `Get-ChildItem -Path "${path}" -Filter "${pattern || '*'}*" -Recurse -ErrorAction SilentlyContinue | Select-Object FullName, Length | Format-Table -AutoSize | Out-String -Width 4096`;
    return await executePowerShellCommand(psCmd, `file_${op}`);
  }
  return { success: false, output: `Operación desconocida: ${op}` };
}

export async function handleComputerAction(call) {
  const action = call.args.action || '';
  const keys = call.args.keys || '';
  const windowTitle = call.args.windowTitle || '';
  let psCmd = '';
  if (action === 'type_text') {
    const escaped = keys.replace(/"/g, '`"').replace(/~/g, '~~').replace(/\+/g, '{+}').replace(/\^/g, '{^}').replace(/%/g, '{%}');
    psCmd = `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("${escaped}")`;
  } else if (action === 'press_keys') {
    psCmd = `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("${keys}")`;
  } else if (action === 'clipboard_get') {
    psCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()`;
  } else if (action === 'clipboard_set') {
    const escaped = keys.replace(/'/g, "''");
    psCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('${escaped}'); "Texto copiado al portapapeles."`;
  } else if (action === 'focus_window') {
    psCmd = `(Get-Process | Where-Object { $_.MainWindowTitle -match '${windowTitle.replace(/'/g, "''")}' }).MainWindowHandle | ForEach-Object { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'; [Win32]::SetForegroundWindow($_) }; "${windowTitle} enfocado."`;
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
  const reminder = call.args.reminder || '';
  const time = call.args.time || '';
  if (!reminder || !time) return { success: false, output: 'Se requiere texto y hora del recordatorio.' };

  const now = new Date();
  let targetDate = null;
  const inMatch = time.match(/in\s+(\d+)\s+(minute|minutes|min|hour|hours)/i);
  const atMatch = time.match(/at\s+(\d{1,2}):(\d{2})/i);
  const tomorrowAt = time.match(/tomorrow\s+at\s+(\d{1,2}):(\d{2})/i);
  if (time.includes('now') || time.includes('ahora')) targetDate = new Date(now.getTime() + 60000);
  else if (inMatch) {
    const n = parseInt(inMatch[1]);
    targetDate = inMatch[2].startsWith('hour') ? new Date(now.getTime() + n * 3600000) : new Date(now.getTime() + n * 60000);
  } else if (tomorrowAt) {
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, parseInt(tomorrowAt[1]), parseInt(tomorrowAt[2]));
  } else if (atMatch) {
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(atMatch[1]), parseInt(atMatch[2]));
    if (targetDate <= now) targetDate.setDate(targetDate.getDate() + 1);
  } else {
    try { targetDate = new Date(time); } catch (e) {}
  }
  if (!targetDate || isNaN(targetDate.getTime())) {
    return { success: false, output: `No se pudo interpretar la hora: "${time}". Usa formato "in X minutes/hours", "at HH:MM", "tomorrow at HH:MM".` };
  }
  const delayMs = targetDate.getTime() - now.getTime();
  if (delayMs < 30000) targetDate = new Date(now.getTime() + 30000);
  const formattedTarget = targetDate.toLocaleString();
  const psCmd = `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -Command \\"& {Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${reminder.Replace("'", "''")}','Recordatorio - JARVIS','OK','Information')}\\"\"; $trigger = New-ScheduledTaskTrigger -Once -At '${targetDate.toISOString()}'; $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name; Register-ScheduledTask -TaskName "JARVIS_Reminder_$(Get-Date -f yyyyMMdd_HHmmss)" -Action $action -Trigger $trigger -User $user -Force -ErrorAction Stop | Out-Null; "Recordatorio programado para: ${formattedTarget}"`;
  const result = await executePowerShellCommand(psCmd, 'set_reminder');
  if (result.success) result.output = `⏰ Recordatorio programado para ${formattedTarget}: ${reminder}`;
  return result;
}

export async function handleSetTimer(call) {
  const label = call.args.label || 'Temporizador';
  const duration = call.args.duration || 0;
  if (duration <= 0) return { success: false, output: 'La duración debe ser mayor a 0 segundos.' };
  const psCmd = `Start-Sleep -Seconds ${duration}; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${label.Replace("'","''")}','⏰ JARVIS Timer','OK','Information'); "⏰ ${label}: ${duration}s completado."`;
  const result = await executePowerShellCommand(psCmd, 'set_timer');
  if (result.success) result.output = `⏰ Temporizador "${label}" iniciado por ${duration}s. Te avisaré cuando termine.`;
  return result;
}

export async function handleProcessFile(call) {
  const path = call.args.path || '';
  const format = call.args.format || '';
  if (!path) return { success: false, output: 'No se especificó ruta de archivo.' };
  const ext = format || path.split('.').pop().toLowerCase();
  let psCmd = '';
  if (ext === 'txt' || ext === 'text') psCmd = `Get-Content -Path "${path}" -Raw -ErrorAction Stop`;
  else if (ext === 'csv') psCmd = `Import-Csv -Path "${path}" -ErrorAction Stop | Format-Table -AutoSize | Out-String -Width 4096`;
  else if (ext === 'docx' || ext === 'doc') psCmd = `Add-Type -AssemblyName System.IO.Compression; $zip=[IO.Compression.ZipFile]::OpenRead("${path}"); $e=$zip.Entries|Where-Object{$_.Name -eq 'word/document.xml'};if($e){$sr=new-object IO.StreamReader($e.Open());$xml=[xml]$sr.ReadToEnd();$sr.Close();$zip.Dispose();$xml.document.body.'#text' -join ' '}else{'No se pudo extraer texto.'}; $zip.Dispose()`;
  else if (ext === 'xlsx' || ext === 'xls') psCmd = `Add-Type -AssemblyName System.IO.Compression; $zip=[IO.Compression.ZipFile]::OpenRead("${path}"); $e=$zip.Entries|Where-Object{$_.Name -eq 'xl/sharedStrings.xml'};if($e){$sr=new-object IO.StreamReader($e.Open());$xml=[xml]$sr.ReadToEnd();$sr.Close();$zip.Dispose();$xml.sst.si|ForEach-Object{$_.t}}else{'No se pudo extraer texto.'}`;
  else if (ext === 'zip') psCmd = `Add-Type -AssemblyName System.IO.Compression; $zip=[IO.Compression.ZipFile]::OpenRead("${path}"); $zip.Entries|Select-Object Name,Length|Format-Table -AutoSize|Out-String -Width 4096; $zip.Dispose()`;
  else if (ext === 'pdf') psCmd = `Add-Type -AssemblyName System.IO.Compression; try{$content=Get-Content -Path "${path}" -Raw -Encoding Byte -TotalCount 100KB; $text=[System.Text.Encoding]::UTF8.GetString($content); if($text -match '(?<=stream\\s).*?(?=\\nendstream)' ){$text} else {'PDF leído (${path}) - contenido binario'}}catch{'No se pudo leer el PDF'}`;
  else if (ext === 'image' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'bmp') psCmd = `Add-Type -AssemblyName System.Drawing; $img=[Drawing.Image]::FromFile("${path}"); "Imagen: $($img.Width)x$($img.Height) px, Formato: $($img.RawFormat)" ; $img.Dispose()`;
  else psCmd = `Get-Content -Path "${path}" -Raw -ErrorAction Stop | Select-Object -First 100`;
  return await executePowerShellCommand(psCmd, `process_file_${ext}`);
}
