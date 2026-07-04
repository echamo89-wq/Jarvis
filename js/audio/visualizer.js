import { store } from '../state/store.js';
import { STATE } from '../state/constants.js';

let canvas = null;
let ctx = null;
let animationId = null;
let phase = 0;

export function initCanvasVisualizer() {
  canvas = document.getElementById('visualizer');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  const resizeObserver = new ResizeObserver(() => _resizeCanvas());
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !animationId) _animateWave();
  });
  _animateWave();
}

function _resizeCanvas() {
  if (canvas) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 80;
  }
}

function _animateWave() {
  if (document.hidden) { animationId = null; return; }
  animationId = requestAnimationFrame(_animateWave);
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;
  phase += 0.05;

  let lines = 3;
  let color = 'rgba(0, 191, 255, ';
  let amplitude = 8;
  let speed = 0.04;
  let frequency = 0.02;
  const waveState = store.getState();

  if (waveState === STATE.SPEAKING) {
    amplitude = 25 + Math.sin(phase * 2) * 5;
    speed = 0.15; frequency = 0.04; lines = 4;
  } else if (waveState === STATE.WORKING) {
    amplitude = 15 + Math.sin(phase * 1.5) * 6;
    speed = 0.1; frequency = 0.03; color = 'rgba(0, 255, 128, '; lines = 3;
  } else if (waveState === STATE.LISTENING) {
    amplitude = 18 + Math.cos(phase * 3) * 4;
    speed = 0.2; frequency = 0.05; color = 'rgba(255, 59, 48, '; lines = 4;
  } else if (waveState === STATE.ERROR) {
    amplitude = 2; speed = 0.01; frequency = 0.1; color = 'rgba(255, 59, 48, '; lines = 1;
  } else {
    amplitude = 6 + Math.sin(phase * 0.5) * 2;
    speed = 0.03; frequency = 0.015; lines = 2;
  }

  for (let i = 0; i < lines; i++) {
    ctx.beginPath();
    ctx.lineWidth = i === 0 ? 2 : 1;
    ctx.strokeStyle = color + (1.0 - i * 0.25) + ')';
    const p = phase * (1 + i * 0.1) * (waveState === STATE.SPEAKING ? 2 : 1);
    for (let x = 0; x < width; x++) {
      const edgeScale = Math.sin((x / width) * Math.PI);
      const y = centerY + Math.sin(x * frequency + p + i * 0.5) * amplitude * edgeScale;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (store.get('micActive') && typeof store.get('lastMicEnergy') === 'number') {
    const meterX = width - 12;
    const meterW = 6;
    const meterH = height - 10;
    const meterY = 5;
    const level = Math.min(1, store.get('lastMicEnergy') / 1000);
    ctx.fillStyle = 'rgba(0, 191, 255, 0.08)';
    ctx.fillRect(meterX, meterY, meterW, meterH);
    const barH = level * meterH;
    const r = level > 0.7 ? 255 : Math.round(255 * (level / 0.7));
    const g = level > 0.7 ? Math.round(255 * (1 - (level - 0.7) / 0.3)) : 191;
    const b = level > 0.7 ? 0 : 255;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
    ctx.fillRect(meterX, meterY + meterH - barH, meterW, barH);
  }
}
