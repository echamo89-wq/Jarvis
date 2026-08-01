import { store } from '../state/store.js';

export function getActiveProvider() {
  return 'gemini';
}

export function setActiveProvider() {
  store.set('_activeProvider', 'gemini');
}

export function isGemini() {
  return true;
}

export async function sendProviderMessage() {
  return { useWS: true };
}

export function abortProviderMessage() {}
