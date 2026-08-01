/**
 * Vision Engine — Change Detector Module.
 * Compara dos capturas de pantalla para determinar si ha habido un cambio visual significativo.
 * Utiliza un offscreen canvas para comparar pixels a baja resolución para rendimiento óptimo.
 */

import { kernel } from '../../kernel/index.js';

const _log = kernel.logger.create('VISION-CHANGES');

/**
 * Compara dos imágenes base64 para ver si cambiaron significativamente.
 * @param {string} base64A 
 * @param {string} base64B 
 * @param {number} threshold - Porcentaje de diferencia mínimo para considerar cambio (0-100), default 5
 * @returns {Promise<boolean>} True si cambió
 */
export async function detectVisualChanges(base64A, base64B, threshold = 5) {
  if (!base64A || !base64B) return true;
  if (base64A === base64B) return false;

  try {
    const [imgA, imgB] = await Promise.all([
      _loadImage(`data:image/png;base64,${base64A}`),
      _loadImage(`data:image/png;base64,${base64B}`)
    ]);

    // Reducir la resolución a 32x32 para hacer comparación ultra rápida
    const size = 32;
    const canvasA = new OffscreenCanvas(size, size);
    const canvasB = new OffscreenCanvas(size, size);
    const ctxA = canvasA.getContext('2d');
    const ctxB = canvasB.getContext('2d');

    ctxA.drawImage(imgA, 0, 0, size, size);
    ctxB.drawImage(imgB, 0, 0, size, size);

    const dataA = ctxA.getImageData(0, 0, size, size).data;
    const dataB = ctxB.getImageData(0, 0, size, size).data;

    let diffPixels = 0;
    const totalPixels = size * size;

    for (let i = 0; i < dataA.length; i += 4) {
      const rDiff = Math.abs(dataA[i] - dataB[i]);
      const gDiff = Math.abs(dataA[i + 1] - dataB[i + 1]);
      const bDiff = Math.abs(dataA[i + 2] - dataB[i + 2]);
      
      // Si la diferencia acumulada de color supera un umbral de ruido (30)
      if (rDiff + gDiff + bDiff > 30) {
        diffPixels++;
      }
    }

    const diffPct = (diffPixels / totalPixels) * 100;
    _log.info(`Diferencia visual calculada: ${diffPct.toFixed(2)}% (umbral: ${threshold}%)`);

    return diffPct >= threshold;
  } catch (e) {
    _log.error(`detectVisualChanges failed: ${e.message}`);
    return true; // Fallback seguro
  }
}

// Helper para cargar imagen
function _loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
