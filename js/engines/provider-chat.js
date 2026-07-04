import { store } from '../state/store.js';
import { appendJarvisMessage, showSystemErrorMessage, hideChatStatus } from '../chat/messages.js';

let _abortController = null;

export function getActiveProvider() {
  return store.get('_activeProvider') || 'gemini';
}

export function setActiveProvider(provider) {
  store.set('_activeProvider', provider);
}

export function isGemini() {
  return getActiveProvider() === 'gemini';
}

export async function sendProviderMessage(text) {
  const provider = getActiveProvider();
  if (isGemini()) {
    return { useWS: true };
  }
  _abortController = new AbortController();
  try {
    hideChatStatus();
    const resp = await fetch('http://localhost:3001/api/proxy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, message: text }),
      signal: _abortController.signal,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error del proveedor');
    const { response, provider: usedProvider } = data;
    if (response) {
      appendJarvisMessage(response);
    }
    return { useWS: false, response: data.response };
  } catch (e) {
    if (e.name === 'AbortError') return { useWS: false };
    showSystemErrorMessage(`Error: ${e.message}`);
    return { useWS: false, error: e.message };
  }
}

export function abortProviderMessage() {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
}
