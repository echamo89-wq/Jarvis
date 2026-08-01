/**
 * Vision Engine — Window Detector Module.
 * Detecta qué ventana o aplicación se encuentra en primer plano.
 */

import { kernel } from '../../kernel/index.js';

const _log = kernel.logger.create('VISION-WINDOW');

/**
 * Obtener detalles de la ventana actualmente enfocada en el sistema operativo.
 * @returns {Promise<{success:boolean, title?:string, process?:string}>}
 */
export async function getActiveWindow() {
  const hasPerm = await kernel.permissions.requestPermission('shell');
  if (!hasPerm) {
    _log.warn('Permiso de ejecución de comandos PowerShell denegado.');
    return { success: false, error: 'Permission denied' };
  }

  try {
    if (!window.electronAPI?.runPowerShell) {
      throw new Error('electronAPI.runPowerShell no está disponible.');
    }

    const command = `
      Add-Type -TypeDefinition @'
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          [DllImport("user32.dll")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        }
'@
      $hwnd = [Win32]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder(256)
      [void][Win32]::GetWindowText($hwnd, $sb, 256)
      $pid = 0
      [void][Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid)
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      
      @{
        title = $sb.ToString()
        process = if ($proc) { $proc.Name } else { "Unknown" }
      } | ConvertTo-Json
    `;

    const res = await window.electronAPI.runPowerShell(command);
    if (!res.success) throw new Error(res.output);

    const parsed = JSON.parse(res.output.trim());
    return {
      success: true,
      title: parsed.title,
      process: parsed.process
    };
  } catch (e) {
    _log.error(`getActiveWindow failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}
