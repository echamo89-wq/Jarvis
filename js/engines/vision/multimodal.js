import { kernel } from '../../kernel/index.js';

const _log = kernel.logger.create('VISION-MULTIMODAL');

export async function analyzeImage(base64, question) {
  return _analyzeWithGemini(base64, question);
}

async function _analyzeWithGemini(base64, question) {
  const ws = window.ws;
  if (!ws || ws.readyState !== 1) {
    return 'WebSocket de Gemini no conectado. No se puede analizar la imagen.';
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
        turns: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64 } },
            { text: question }
          ]
        }],
        turnComplete: true
      }
    }));

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (cleanup) cleanup();
        resolve('Timeout al esperar respuesta visual de Gemini.');
      }
    }, 45000);
  });
}
