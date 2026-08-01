import { store } from '../../state/store.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('CONTROLS');

export async function changeSystemVolume(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  try {
    const slider = document.getElementById('vol-slider');
    const valLabel = document.getElementById('vol-value');
    if (slider) slider.value = pct;
    if (valLabel) valLabel.innerText = `${pct}%`;
  } catch (e) {}

  const r = await window.electronAPI.setVolume(pct);
  if (!r.success) {
    _log('error', `Volume setting failed`);
  } else {
    store.set('lastVolume', pct);
  }
  return r;
}

export async function changeSystemBrightness(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  try {
    const slider = document.getElementById('bright-slider');
    const valLabel = document.getElementById('bright-value');
    if (slider) slider.value = pct;
    if (valLabel) valLabel.innerText = `${pct}%`;
  } catch (e) {}

  const r = await window.electronAPI.setBrightness(pct);
  if (!r.success) {
    _log('error', `Brightness setting failed`);
  }
  return r;
}
