import { store } from '../state/store.js';
import { createLogger } from '../utils/logger.js';
const _log = createLogger('CONTROLS');

export async function changeSystemVolume(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  let currentVol = null;
  try {
    const current = await window.electronAPI.getVolume();
    if (current.success) currentVol = current.volume;
  } catch (e) {}

  if (currentVol !== null) {
    const diff = Math.abs(currentVol - pct);
    if (diff <= 3 && pct !== 0 && pct !== 100) {
      return {
        success: true,
        output: `El volumen ya está al ${currentVol}%. ${
          pct > currentVol
            ? `Solo ${diff}% por debajo de lo solicitado (${pct}%).`
            : `Solo ${diff}% por encima de lo solicitado (${pct}%).`
        } No es necesario ajustar.`
      };
    }
  }

  try {
    const slider = document.getElementById('vol-slider');
    const valLabel = document.getElementById('vol-value');
    if (slider) slider.value = pct;
    if (valLabel) valLabel.innerText = `${pct}%`;
  } catch (e) {}

  const r = await window.electronAPI.setVolume(pct);
  if (!r.success) {
    _log('error', `Volume setting failed`);
    return {
      success: false,
      output: `Hay un inconveniente al ajustar el volumen. Verifica que los altavoces o auriculares estén conectados correctamente.`
    };
  }

  store.set('lastVolume', pct);
  const msg = currentVol !== null
    ? `Volumen cambiado de ${currentVol}% a ${pct}%.`
    : `Volumen cambiado a ${pct}%.`;
  return { success: true, output: msg };
}

export async function changeSystemBrightness(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  let currentBright = null;
  try {
    const current = await window.electronAPI.getBrightness();
    if (current.success) currentBright = current.brightness;
  } catch (e) {}

  if (currentBright !== null) {
    const diff = Math.abs(currentBright - pct);
    if (diff <= 3 && pct !== 0 && pct !== 100) {
      return {
        success: true,
        output: `El brillo ya está al ${currentBright}%. ${
          pct > currentBright
            ? `Solo ${diff}% por debajo de lo solicitado (${pct}%).`
            : `Solo ${diff}% por encima de lo solicitado (${pct}%).`
        } No es necesario ajustar.`
      };
    }
  }

  try {
    const slider = document.getElementById('bright-slider');
    const valLabel = document.getElementById('bright-value');
    if (slider) slider.value = pct;
    if (valLabel) valLabel.innerText = `${pct}%`;
  } catch (e) {}

  const r = await window.electronAPI.setBrightness(pct);
  if (!r.success) {
    _log('error', `Brightness setting failed`);
    return {
      success: false,
      output: `Hay un inconveniente al ajustar el brillo. Es posible que este monitor no tenga control de brillo por software.`
    };
  }

  const msg = currentBright !== null
    ? `Brillo cambiado de ${currentBright}% a ${pct}%.`
    : `Brillo cambiado a ${pct}%.`;
  return { success: true, output: msg };
}
