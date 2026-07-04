/**
 * LLM Handler — Conmutador entre Cloud (Gemini WS) y Local (Ollama REST)
 *
 * Uso:
 *   import { ask } from './engines/llm-handler.js';
 *   const r = await ask("¿Qué hora es?");
 *
 * La función `ask` detecta automáticamente el modo activo
 * y enruta la petición al motor correcto.
 */

import { store } from '../state/store.js';
import { getMode, getLocalModel, askLocalModel } from '../system/model-manager.js';
import { showSystemErrorMessage } from '../chat/messages.js';

/**
 * Envía un prompt al motor activo (Cloud ↔ Local).
 * @param {string} prompt - Texto a enviar
 * @param {object} opts - Opciones: { stream, temperature }
 * @returns {Promise<string|null>} Respuesta del modelo
 */
export async function ask(prompt, opts = {}) {
  const mode = getMode();

  if (mode === 'local') {
    return _askLocal(prompt, opts);
  }

  // Cloud: el WebSocket ya maneja el envío a Gemini
  // Esta función es solo para consultas directas (tool calls)
  return _askCloudFallback(prompt);
}

async function _askLocal(prompt, opts) {
  const model = getLocalModel();
  if (!model) {
    showSystemErrorMessage('No hay modelo local seleccionado. Ve a Configuración → Jarvis.');
    return null;
  }

  const response = await askLocalModel(prompt);
  if (response === null) {
    showSystemErrorMessage('Error de conexión con Ollama. ¿Está corriendo?');
    return null;
  }
  return response;
}

async function _askCloudFallback(prompt) {
  // Fallback para consultas tool desde modo cloud
  // En modo cloud normal, el WS envía directamente a Gemini
  const ws = window.ws;
  if (ws && ws.readyState === 1) {
    return new Promise((resolve) => {
      const msgId = Date.now();
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.data || data);
          if (msg.setupComplete) return;
          const text = msg?.setupComplete?.response?.candidates?.[0]?.content?.parts?.[0]?.text
                    || msg?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) { resolve(text); window.removeEventListener('ws-message', handler); }
        } catch {}
      };
      window.addEventListener('ws-message', handler);
      ws.send(JSON.stringify({
        clientContent: { turns: [{ role: 'user', parts: [{ text: prompt }] }], turnComplete: true }
      }));
      setTimeout(() => { window.removeEventListener('ws-message', handler); resolve(null); }, 15000);
    });
  }
  showSystemErrorMessage('Sistemas fuera de línea.');
  return null;
}
