/**
 * Vision Engine — Capture Module.
 * Gestiona la captura de la pantalla usando Electron IPC o PowerShell en su defecto.
 */

import { kernel } from '../../kernel/index.js';

const _log = kernel.logger.create('VISION-CAPTURE');

/**
 * Captura la pantalla actual.
 * @returns {Promise<{success:boolean, base64?:string}>}
 */
export async function captureScreen() {
  try {
    if (window.electronAPI?.captureScreenshotBase64) {
      const result = await window.electronAPI.captureScreenshotBase64();
      if (result.success) {
        return { success: true, base64: result.data };
      }
      throw new Error(result.error || 'capture failed');
    }
    
    // Fallback: capturar vía PowerShell y leer como base64
    const result = await window.electronAPI.runPowerShell(`
      Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
      $s=[Windows.Forms.Screen]::PrimaryScreen.Bounds;
      $b=New-Object Drawing.Bitmap($s.Width,$s.Height);
      $g=[Drawing.Graphics]::FromImage($b);
      $g.CopyFromScreen($s.Location,[Drawing.Point]::Empty,$s.Size);
      $tmp=[System.IO.Path]::GetTempFileName() + ".png";
      $b.Save($tmp); $g.Dispose(); $b.Dispose();
      [Convert]::ToBase64String([IO.File]::ReadAllBytes($tmp));
      Remove-Item $tmp -Force
    `);
    
    if (!result.success) throw new Error(result.output);
    return { success: true, base64: result.output.trim() };
  } catch (e) {
    _log.error(`captureScreen: ${e.message}`);
    return { success: false, error: e.message };
  }
}
