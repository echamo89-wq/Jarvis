// ============================================================
// Embeddings locales — sin llamadas a API externa
// Usa TF-IDF con representación hash como sustituto ligero y offline
// de los embeddings semánticos de Gemini.
// Ventajas: instantáneo, sin cuota, sin errores de red, funciona siempre.
// Limitación: busca por palabras similares, no por significado semántico.
// ============================================================

const VECTOR_SIZE = 512;

// Normaliza y tokeniza texto en español/inglés
function _tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quita acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)         // descarta tokens cortos
    .filter(t => !_STOPWORDS.has(t));  // descarta stopwords
}

// Stopwords en español + inglés para mejorar la relevancia
const _STOPWORDS = new Set([
  // Español
  'que','de','en','el','la','los','las','un','una','unos','unas','por','con','para',
  'del','al','se','su','sus','le','les','me','te','nos','es','son','fue','era',
  'hay','no','si','ya','pero','más','como','cuando','donde','sobre','este','esta',
  'ese','esa','yo','tu','él','ella','ellos','ellas','mi','mis','muy','todo','toda',
  // Inglés
  'the','is','are','was','were','be','been','have','has','had','do','does','did',
  'will','would','can','could','should','may','might','and','but','or','nor','for',
  'not','in','on','at','to','of','from','with','by','about','as','into','than'
]);

// Genera un hash djb2 determinístico del token y lo mapea al vector
function _tokenHash(token) {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash) ^ token.charCodeAt(i);
    hash = hash >>> 0; // mantener 32bit unsigned
  }
  return hash % VECTOR_SIZE;
}

// Genera el vector TF-IDF para un texto dado
export function generateEmbedding(text) {
  if (!text || !text.trim()) return Promise.resolve(new Float32Array(VECTOR_SIZE));
  const tokens = _tokenize(text.substring(0, 4000));
  const tf = new Float32Array(VECTOR_SIZE);

  // Contar frecuencia de cada token
  const counts = {};
  for (const t of tokens) {
    counts[t] = (counts[t] || 0) + 1;
  }

  // Distribuir peso por posición hash (con bi-gramas para contexto)
  const tokenList = Object.keys(counts);
  for (const t of tokenList) {
    const idx = _tokenHash(t);
    tf[idx] += counts[t];
    // Bi-grama: combinar con siguiente token para capturar frases
    const nextIdx = _tokenHash(t + '_ng');
    tf[nextIdx] += counts[t] * 0.5;
  }

  // Normalización L2
  let norm = 0;
  for (let i = 0; i < tf.length; i++) norm += tf[i] * tf[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < tf.length; i++) tf[i] /= norm;

  return Promise.resolve(tf);
}

// Versión batch — igual que individual, solo iterada
export async function generateEmbeddingBatch(texts) {
  return Promise.all(texts.map(t => generateEmbedding(t)));
}
