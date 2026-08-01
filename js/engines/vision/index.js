/**
 * Vision Engine — Unified Entry Point.
 * Expone la API completa del motor de visión subdividida.
 */

import { captureScreen } from './capture.js';
import { analyzeImage } from './multimodal.js';
import { extractText } from './ocr.js';
import { describeScene } from './scene.js';
import { getActiveWindow } from './window-detector.js';
import { detectVisualChanges } from './change-detector.js';

let _visionEnabled = false;

export {
  captureScreen,
  analyzeImage as analyzeScreen,
  extractText as extractTextFromScreen,
  describeScene,
  getActiveWindow,
  detectVisualChanges
};

export function enableVision() {
  _visionEnabled = true;
}

export function disableVision() {
  _visionEnabled = false;
}

export function isVisionEnabled() {
  return _visionEnabled;
}

/**
 * Capturar y analizar en un solo paso (backward compatibility).
 */
export async function captureAndAnalyze(question) {
  const cap = await captureScreen();
  if (!cap.success) {
    return 'No se pudo capturar la pantalla por falta de permisos o error.';
  }
  return await analyzeImage(cap.base64, question);
}
