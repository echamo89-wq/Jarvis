/**
 * Vision Engine — Scene Descriptor Module.
 * Analiza y describe el contexto y los elementos de la pantalla de forma estructurada.
 */

import { analyzeImage } from './multimodal.js';

/**
 * Describe qué hay en la pantalla.
 * @param {string} base64 
 * @param {string} [question] - Pregunta u orientación de la descripción
 * @returns {Promise<string>}
 */
export async function describeScene(base64, question) {
  const prompt = question || '¿Qué ves en esta pantalla? Describe en detalle la interfaz de usuario, las aplicaciones abiertas y el contenido principal.';
  return await analyzeImage(base64, prompt);
}
