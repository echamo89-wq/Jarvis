import { store } from '../../state/store.js';
import { createLogger } from '../../utils/logger.js';

const _log = createLogger('VISION');

let _visionEnabled = false;

export function enableVision()  { _visionEnabled = true; }
export function disableVision() { _visionEnabled = false; }
export function isVisionEnabled() { return _visionEnabled; }

export async function captureScreen() {
  try {
    if (window.electronAPI?.captureScreenshotBase64) {
      const b64 = await window.electronAPI.captureScreenshotBase64();
      if (b64) return b64;
    }
    const ps = "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height; $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($screen.X, $screen.Y, 0, 0, $screen.Size); $ms = New-Object System.IO.MemoryStream; $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bytes = $ms.ToArray(); [Convert]::ToBase64String($bytes)";
    const result = await window.electronAPI.runPowerShell(ps);
    return result?.trim() || null;
  } catch (e) {
    _log.error(`captureScreen error: ${e.message}`);
    return null;
  }
}

export async function analyzeScreen(base64, question) {
  const ws = window.ws;
  if (!ws || ws.readyState !== 1) {
    return 'WebSocket no conectado.';
  }
  return new Promise((resolve) => {
    let cleanup = null;
    let resolved = false;
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data || event);
        if (msg.setupComplete) return;
        const text = msg?.serverContent?.modelTurn?.parts?.find(p => p.text)?.text
                  || msg?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && !resolved) {
          resolved = true;
          if (cleanup) cleanup();
          resolve(text.trim());
        }
      } catch {}
    };
    if (window.electronAPI?.onWsMessage) {
      cleanup = window.electronAPI.onWsMessage(handler);
    }
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [
          { inlineData: { mimeType: 'image/png', data: base64 } },
          { text: question }
        ]}],
        turnComplete: true
      }
    }));
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (cleanup) cleanup();
        resolve('Timeout al analizar con Gemini.');
      }
    }, 20000);
  });
}

export async function extractTextFromScreen(base64) {
  return analyzeScreen(base64, 'Extrae TODO el texto visible en esta pantalla. Respondé SOLO con el texto extraído, sin comentarios ni análisis.');
}

export async function captureAndAnalyze(question) {
  const base64 = await captureScreen();
  if (!base64) return 'No se pudo capturar la pantalla.';
  return analyzeScreen(base64, question || 'Describe todo lo que ves en esta pantalla en español.');
}
