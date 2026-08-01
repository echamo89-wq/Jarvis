import { executePowerShellCommand } from '../system/powershell.js';

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
  } else {
    return { success: false, output: `Acción desconocida: ${action}` };
  }

  if (psCmd) return await executePowerShellCommand(psCmd, `computer_${action}`);
  return { success: false, output: 'Error en computer_action' };
}
