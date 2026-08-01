/**
 * Vision Engine — OCR Module.
 * Extrae texto visible de imágenes usando el modelo de lenguaje de visión.
 */

import { analyzeImage } from './multimodal.js';

/**
 * Extrae el texto visible de una captura base64.
 * @param {string} base64 
 * @returns {Promise<string>}
 */
export async function extractText(base64) {
  const prompt = 'Extrae y transcribe exactamente todo el texto visible que aparece en esta imagen. Devuelve solo la transcripción sin descripciones o introducciones extras.';
  return await analyzeImage(base64, prompt);
}
