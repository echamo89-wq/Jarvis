import { createLogger } from '../../utils/logger.js';
const _log = createLogger('APP_NORMALIZER');

const ACTION_WORDS = new Set([
  'open', 'launch', 'run', 'start', 'play', 'execute', 'show',
  'abrir', 'lanzar', 'ejecutar', 'iniciar', 'mostrar', 'abre', 'lanza',
  'search', 'find', 'buscar', 'encuentra',
  'go to', 'ir a', 'navegar',
]);

export function normalizeInput(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim().toLowerCase();
  s = s.replace(/['"`´‘’“”]/g, '');
  s = s.replace(/[¿¡]/g, '');
  s = s.replace(/[.,!?;:]+$/, '');
  return s;
}

export function stripActionWords(input) {
  let s = normalizeInput(input);
  const words = s.split(/\s+/);
  const filtered = words.filter(w => !ACTION_WORDS.has(w));
  const result = filtered.join(' ').trim();
  return result || s;
}

export function extractQuery(raw) {
  return stripActionWords(raw);
}

export function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getActionWords() {
  return Array.from(ACTION_WORDS);
}

export default { normalizeInput, stripActionWords, extractQuery, normalizeName, getActionWords };
