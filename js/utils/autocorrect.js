// ──────────────────────────────────────────────────────────────────
// autocorrect.js — Corrección y fusión de transcripciones de voz
// Sistema híbrido: regex rápido + LLM polish con Gemini Flash
// ──────────────────────────────────────────────────────────────────

import { JARVIS_CONFIG } from '../config/jarvis.config.js';

// Correcciones de abreviaturas
const _corrections = [
  [/^enos(\s|$)/i, 'Buenos$1'],
  [/^en dia(\s|$)/i, 'Buen día$1'],
  [/^gervis\b/i, 'Jarvis'],
  [/\bgervis\b/i, 'Jarvis'],
  [/\bjarvis\b/gi, 'Jarvis'],
  [/\bxq\b/gi, 'por qué'],
  [/\bpq\b/gi, 'porque'],
  [/\bq tal\b/gi, 'qué tal'],
  [/\bq hace\b/gi, 'qué hace'],
  [/\bq pasa\b/gi, 'qué pasa'],
  [/\bq hay\b/gi, 'qué hay'],
  [/\bq es\b/gi, 'qué es'],
  [/\btb\b/gi, 'también'],
  [/\bdnd\b/gi, 'dónde'],
  [/\bxo\b/gi, 'yo'],
  [/\bkon\b/gi, 'con'],
  [/\bkomo\b/gi, 'como'],
  [/\bmuxo\b/gi, 'mucho'],
  [/\bmuxa\b/gi, 'mucha'],
  [/\baki\b/gi, 'aquí'],
  [/\bkreo\b/gi, 'creo'],
  [/\babre spoti\b/gi, 'abre Spotify'],
  // Palabras del habla rápida que Gemini confunde
  [/\boka\b/gi, 'ok'],
  [/\bokay\b/gi, 'ok'],
  [/\bwatsa\b/gi, 'WhatsApp'],
  [/\bwap\b/gi, 'WhatsApp'],
  [/\bsp\b(?= |$)/gi, 'Spotify'],
  [/\bgg\b/gi, 'gg'],
  [/\bk\b/gi, 'que'],
  [/\bsii\b/gi, 'sí'],
  [/\bnooo\b/gi, 'no'],
  [/\bbueno diass?\b/gi, 'buenos días'],
  [/\bbue nos días\b/gi, 'buenos días'],
  [/\bbuenas noches?\b/gi, 'buenas noches'],
  [/\bbuenas tardes?\b/gi, 'buenas tardes'],
  [/\bporfa\b/gi, 'por favor'],
  [/\bxfavor\b/gi, 'por favor'],
  // Correcciones fonéticas del español rioplatense / latinoamericano
  [/\bvotz\b/gi, 'vos'],
  [/\bvoz\b(?!\s+de\b)/gi, 'voz'],
  [/\bpodes\b/gi, 'podés'],
  [/\btenes\b/gi, 'tenés'],
  [/\bsabes\b/gi, 'sabés'],
  [/\bpodes\b/gi, 'podés'],
];

// Patrones explícitos de palabras fragmentadas — más completos
const _fragmentPatterns = [
  // Apps y marcas
  [/\bInsta gram\b/gi, 'Instagram'],
  [/\bwhats app\b/gi, 'WhatsApp'],
  [/\byou tube\b/gi, 'YouTube'],
  [/\bface book\b/gi, 'Facebook'],
  [/\bspoti fy\b/gi, 'Spotify'],
  [/\bdisc ord\b/gi, 'Discord'],
  [/\btele gram\b/gi, 'Telegram'],
  // Palabras comunes fragmentadas
  [/\bmu y\b/gi, 'muy'],
  [/\ba ho ra\b/gi, 'ahora'],
  [/\baho rra\b/gi, 'ahora'],
  [/\bcce so\b/gi, 'acceso'],
  [/\bdi rec to\b/gi, 'directo'],
  [/\bdire cto\b/gi, 'directo'],
  [/\bNe cesito\b/g, 'Necesito'],
  [/\bne ce si to\b/gi, 'necesito'],
  [/\bne cesi to\b/gi, 'necesito'],
  [/\bne cesito\b/gi, 'necesito'],
  [/\bpuede s\b/gi, 'puedes'],
  [/\bescu char\b/gi, 'escuchar'],
  [/\bescu cha\b/gi, 'escucha'],
  [/\ba ten to\b/gi, 'atento'],
  [/\bpa ra\b/gi, 'para'],
  [/\bfun cio na\b/gi, 'funciona'],
  [/\bto do\b/gi, 'todo'],
  [/\blle gar\b/gi, 'llegar'],
  [/\bque ría\b/gi, 'quería'],
  [/\bque ri a\b/gi, 'quería'],
  [/\bpor fa\b/gi, 'porfa'],
  [/\bter re mo to\b/gi, 'terremoto'],
  [/\bter re mo tos\b/gi, 'terremotos'],
  [/\bter remo to\b/gi, 'terremoto'],
  [/\bter remotos\b/gi, 'terremotos'],
  [/\bterre moto\b/gi, 'terremoto'],
  [/\bterre motos\b/gi, 'terremotos'],
  [/\búl ti mos\b/gi, 'últimos'],
  [/\búlti mos\b/gi, 'últimos'],
  [/\búl timos\b/gi, 'últimos'],
  [/\últi mos\b/gi, 'últimos'],
  [/\últi ma\b/gi, 'última'],
  [/\bhu bie ron\b/gi, 'hubieron'],
  [/\bhubi eron\b/gi, 'hubieron'],
  [/\bhu biero nen\b/gi, 'hubieron en'],
  [/\bhubi ero nen\b/gi, 'hubieron en'],
  [/\bcua tro\b/gi, 'cuatro'],
  [/\bcu a tro\b/gi, 'cuatro'],
  [/\bca rac te rís ti cas\b/gi, 'características'],
  [/\bcarac te rísticas\b/gi, 'características'],
  [/\bca racterísticas\b/gi, 'características'],
  [/\bcar ac te rísticas\b/gi, 'características'],
  [/\bin for ma ción\b/gi, 'información'],
  [/\bin for mación\b/gi, 'información'],
  [/\bin formación\b/gi, 'información'],
  [/\bdi fe ren te\b/gi, 'diferente'],
  [/\bdi ferente\b/gi, 'diferente'],
  [/\bdi fe rentes\b/gi, 'diferentes'],
  [/\bim por tan te\b/gi, 'importante'],
  [/\bim portante\b/gi, 'importante'],
  [/\bim por tantes\b/gi, 'importantes'],
  [/\bim portantes\b/gi, 'importantes'],
  [/\bdis po ni ble\b/gi, 'disponible'],
  [/\bdispo nible\b/gi, 'disponible'],
  [/\bac tual men te\b/gi, 'actualmente'],
  [/\bactual mente\b/gi, 'actualmente'],
  [/\bapli ca ción\b/gi, 'aplicación'],
  [/\baplica ción\b/gi, 'aplicación'],
  [/\bconfi gu ra ción\b/gi, 'configuración'],
  [/\bconfi guración\b/gi, 'configuración'],
  [/\bejemplos\b/gi, 'ejemplos'],
  [/\bej emplos\b/gi, 'ejemplos'],
  [/\bej emplo\b/gi, 'ejemplo'],
  [/\bej em plos\b/gi, 'ejemplos'],
  [/\beje mplo\b/gi, 'ejemplo'],
  [/\beje mplos\b/gi, 'ejemplos'],
  [/\bcla ros\b/gi, 'claros'],
  [/\bcla ro\b/gi, 'claro'],
  [/\bni ño\b/gi, 'niño'],
  [/\bni ños\b/gi, 'niños'],
  [/\bni ñode\b/gi, 'niño de'],
  [/\baños\b/gi, 'años'],
  [/\ba ños\b/gi, 'años'],
  [/\bbu ena\b/gi, 'buena'],
  [/\bbu enas\b/gi, 'buenas'],
  [/\bbu en\b/gi, 'buen'],
  [/\bbu enos\b/gi, 'buenos'],
  [/\bpre gun ta\b/gi, 'pregunta'],
  [/\bpre gunta\b/gi, 'pregunta'],
  [/\bres pues ta\b/gi, 'respuesta'],
  [/\bres puesta\b/gi, 'respuesta'],
  [/\bsu ma\b/gi, 'suma'],
  [/\bsu ma líde\b/gi, 'sumada de los'],
  [/\bsuma líde\b/gi, 'sumada de los'],
  [/\bsuma li de\b/gi, 'sumada de los'],
  [/\bme to do lo gía\b/gi, 'metodología'],
  [/\bme to dolo gía\b/gi, 'metodología'],
  [/\bmeto dolo gía\b/gi, 'metodología'],
  [/\bM u y\b/gi, 'Muy'],
  [/\bfun cio nar\b/gi, 'funcionar'],
  [/\btam bién\b/gi, 'también'],
  [/\bsco re\b/gi, 'score'],
  [/\bex pli ca ción\b/gi, 'explicación'],
  [/\bex plicación\b/gi, 'explicación'],
  [/\bex pli ca\b/gi, 'explica'],
  [/\bun fect\b/gi, 'un efecto'],
  [/\bfect\s+quí\b/gi, 'efecto quí'],
  [/\bquí mi co\b/gi, 'químico'],
  [/\bpre ci so\b/gi, 'preciso'],
  [/\bpro ble ma\b/gi, 'problema'],
  [/\bpro blema\b/gi, 'problema'],
  [/\bsi guien te\b/gi, 'siguiente'],
  [/\bsi guiente\b/gi, 'siguiente'],
  [/\bsco pe\b/gi, 'scope'],
  [/\bre sul ta do\b/gi, 'resultado'],
  [/\bre sultado\b/gi, 'resultado'],
  [/\bco ne xión\b/gi, 'conexión'],
  [/\bco nexión\b/gi, 'conexión'],
  [/\bdi rec ción\b/gi, 'dirección'],
  [/\bdirec ción\b/gi, 'dirección'],
  [/\bge ne rar\b/gi, 'generar'],
  [/\bge nerar\b/gi, 'generar'],
  [/\be jem plo\b/gi, 'ejemplo'],
  [/\bcom pa ñía\b/gi, 'compañía'],
  [/\bcom pañía\b/gi, 'compañía'],
  [/\bbe né fi cios\b/gi, 'beneficios'],
  [/\bbene ficios\b/gi, 'beneficios'],
  [/\bac tua li za\b/gi, 'actualiza'],
  [/\bactua liza\b/gi, 'actualiza'],
  // Frases comunes mal transcritas
  [/\behqui siera\b/gi, 'quisiera'],
  [/\behqui\b/gi, 'quisiera'],
  [/\beh qui\b/gi, 'quisiera'],
  [/\beh kie\b/gi, 'quisiera'],
  [/\bqui sie ra\b/gi, 'quisiera'],
  [/\bqui siera\b/gi, 'quisiera'],
  [/\bme di ga\b/gi, 'me diga'],
  [/\bme di gas\b/gi, 'me digas'],
  [/\bpue des\b/gi, 'puedes'],
  [/\bha bla me\b/gi, 'háblame'],
  [/\bcuen ta me\b/gi, 'cuéntame'],
  [/\bcuen tame\b/gi, 'cuéntame'],
  [/\bex pli ca me\b/gi, 'explícame'],
  [/\bex plicame\b/gi, 'explícame'],
  [/\bco mo\b/gi, 'cómo'],
  [/\bdon de\b/gi, 'dónde'],
  [/\bque\b(?=\s)/gi, 'que'],
  [/\bmas\b/gi, 'más'],
  // Palabras técnicas frecuentes
  [/\bpawa shel\b/gi, 'PowerShell'],
  [/\bpow er shell\b/gi, 'PowerShell'],
  [/\bpow ershell\b/gi, 'PowerShell'],
  [/\bpow er shel\b/gi, 'PowerShell'],
  [/\bwin dows\b/gi, 'Windows'],
  [/\ban droid\b/gi, 'Android'],
  [/\bin ternet\b/gi, 'internet'],
  [/\byou tu be\b/gi, 'YouTube'],
  [/\byou tube\b/gi, 'YouTube'],
  [/\bgit hub\b/gi, 'GitHub'],
  [/\bchar gpt\b/gi, 'ChatGPT'],
  [/\bcha tgpt\b/gi, 'ChatGPT'],
  [/\bgoo gle\b/gi, 'Google'],
  [/\bwhat sapp\b/gi, 'WhatsApp'],
  [/\bwhat's app\b/gi, 'WhatsApp'],
  [/\bmicro soft\b/gi, 'Microsoft'],
  [/\bmi cro soft\b/gi, 'Microsoft'],
  [/\bno ti cia\b/gi, 'noticia'],
  [/\bnoti cia\b/gi, 'noticia'],
  [/\bnoti cias\b/gi, 'noticias'],
  [/\bno ti cias\b/gi, 'noticias'],
  // Verbos comunes del habla
  [/\ba brir\b/gi, 'abrir'],
  [/\bce rrar\b/gi, 'cerrar'],
  [/\bce rra\b/gi, 'cierra'],
  [/\bes cri bir\b/gi, 'escribir'],
  [/\bes cribir\b/gi, 'escribir'],
  [/\bles cribir\b/gi, 'escribir'],
  [/\bana li zar\b/gi, 'analizar'],
  [/\bana lizar\b/gi, 'analizar'],
  [/\bana li za\b/gi, 'analiza'],
  [/\bana liza\b/gi, 'analiza'],
  [/\bha blar\b/gi, 'hablar'],
  [/\bha bla\b/gi, 'habla'],
  [/\bpre sen tar\b/gi, 'presentar'],
  [/\bpre sentar\b/gi, 'presentar'],
  [/\bver i fi car\b/gi, 'verificar'],
  [/\bveri ficar\b/gi, 'verificar'],
  // Interrogativos y conectores
  [/\bcuán to\b/gi, 'cuánto'],
  [/\bcu an to\b/gi, 'cuánto'],
  [/\bcuán tos\b/gi, 'cuántos'],
  [/\bcuán do\b/gi, 'cuándo'],
  [/\bcu an do\b/gi, 'cuando'],
  [/\bqué tal\b/gi, 'qué tal'],
  [/\bqué hay\b/gi, 'qué hay'],
  [/\bpor que\b(?! no|que)/gi, 'porque'],
  [/\bsin em bar go\b/gi, 'sin embargo'],
  [/\bsin embar go\b/gi, 'sin embargo'],
  [/\ba de más\b/gi, 'además'],
  [/\bade más\b/gi, 'además'],
  [/\btem pra no\b/gi, 'temprano'],
  [/\btempra no\b/gi, 'temprano'],
  [/\bsi guien te\b/gi, 'siguiente'],
];

// Palabras cortas válidas que NO deben fusionarse con la siguiente
const _validShortWords = new Set([
  'a', 'e', 'i', 'o', 'u', 'y', 'el', 'la', 'lo', 'le', 'se',
  'de', 'en', 'un', 'su', 'tu', 'mi', 'nos', 'os', 'te', 'me',
  'por', 'con', 'sin', 'que', 'los', 'las', 'les', 'una', 'uno',
  'es', 'ya', 'al', 'del', 'no', 'si', 'se', 'va', 'ha', 'he',
  'has', 'han', 'hay', 'fue', 'era', 'ser', 'son', 'mas', 'pero',
  'como', 'para', 'esta', 'este', 'todo', 'bien', 'muy', 'más',
  'tan', 'tal', 'vez', 'así', 'eso', 'esa', 'ese', 'eso', 'ahí',
  'acá', 'aquí', 'allí', 'allá', 'dos', 'tres', 'seis', 'ocho',
  'diez', 'hoy', 'ayer', 'dos', 'por', 'qué', 'quién', 'cuál',
  'dónde', 'cómo', 'cuándo', 'cuánto',
]);

// Vocabulario mínimo de palabras válidas en español para validar fusiones
const _spanishWords = new Set([
  'necesito', 'quiero', 'puedo', 'podría', 'debería', 'tengo', 'tenemos',
  'cuatro', 'cinco', 'siete', 'nueve', 'cien', 'mil',
  'terremoto', 'terremotos', 'información', 'últimos', 'últimas', 'último', 'última',
  'ahora', 'antes', 'después', 'cuando', 'donde', 'porque', 'aunque',
  'importante', 'diferentes', 'disponible', 'aplicación', 'configuración',
  'ejemplo', 'ejemplos', 'pregunta', 'respuesta', 'directo', 'directa',
  'funciona', 'funcionar', 'también', 'hubieron', 'hubiera', 'características',
  'resultado', 'resultados', 'siguiente', 'anterior', 'problema', 'problemas',
  'dirección', 'conexión', 'conexiones', 'actualmente', 'actualmente',
  'metodología', 'tecnología', 'tecnologías', 'generación', 'generaciones',
  'explicación', 'comunicación', 'situación', 'condiciones', 'condición',
  'necesita', 'necesitan', 'necesitamos', 'haciendo', 'diciendo', 'siendo',
  'primera', 'primero', 'segunda', 'segundo', 'tercero', 'tercera',
  'personal', 'personas', 'persona', 'sistema', 'sistemas', 'datos',
  'archivo', 'archivos', 'carpeta', 'carpetas', 'código', 'función',
  'funciones', 'módulo', 'módulos', 'proyecto', 'proyectos', 'tarea',
  'tareas', 'proceso', 'procesos', 'análisis', 'búsqueda', 'búsquedas',
  'investigación', 'investigaciones', 'documento', 'documentos', 'texto',
  'textos', 'mensaje', 'mensajes', 'usuario', 'usuarios', 'nombre', 'nombres',
  'tiempo', 'tiempos', 'lugar', 'lugares', 'mundo', 'países', 'ciudad',
  'ciudades', 'fecha', 'fechas', 'número', 'números', 'letra', 'letras',
  'lista', 'listas', 'página', 'páginas', 'pantalla', 'ventana', 'ventanas',
  'botón', 'botones', 'menú', 'menús', 'opción', 'opciones', 'error',
  'errores', 'programa', 'programas', 'aplicación', 'aplicaciones',
]);

function _fixFragmentedWords(text) {
  let t = text.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+([.,!?;:])/g, '$1');

  const words = t.split(' ');
  if (words.length < 2) return t;

  const result = [];
  let i = 0;
  while (i < words.length) {
    if (words[i] === '') { i++; continue; }
    const current = words[i];
    const currentLow = current.toLowerCase();

    // Consonante sola → fusionar con siguiente
    const isSingleConsonant = current.length === 1 && !'aeiouyáéíóúü'.includes(currentLow);
    if (isSingleConsonant && i + 1 < words.length) {
      result.push(current + words[i + 1]);
      i += 2;
      continue;
    }

    // Intento de fusión inteligente: si la suma de dos palabras cortas forma
    // una palabra española conocida, fusionarlas
    if (i + 1 < words.length) {
      const next = words[i + 1];
      const nextLow = next.toLowerCase();
      const combined = currentLow + nextLow;

      // Fusionar si la combinación es una palabra española válida conocida
      if (_spanishWords.has(combined) && !_validShortWords.has(currentLow)) {
        result.push(current + next);
        i += 2;
        continue;
      }

      // Fusionar palabras muy cortas no válidas: ≤2 chars + siguiente
      if (currentLow.length <= 2 && !_validShortWords.has(currentLow) && current.length >= 1) {
        if (nextLow.length >= 3 || (!_validShortWords.has(nextLow) && nextLow.length <= 2)) {
          result.push(current + next);
          i += 2;
          continue;
        }
      }

      // Fusionar si la palabra actual ≤3 chars no es válida + siguiente ≤3 chars no válida
      if (currentLow.length <= 3 && nextLow.length <= 3 &&
          !_validShortWords.has(currentLow) && !_validShortWords.has(nextLow) &&
          combined.length >= 4) {
        result.push(current + next);
        i += 2;
        continue;
      }
    }

    result.push(current);
    i++;
  }

  return result.join(' ');
}

function _cleanText(text) {
  if (!text) return '';
  let t = text;
  if (t.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').length < 2) return '';

  // Aplicar patrones explícitos primero (los más confiables)
  for (let i = 0; i < _fragmentPatterns.length; i++) {
    t = t.replace(_fragmentPatterns[i][0], _fragmentPatterns[i][1]);
  }

  // Correcciones de abreviaturas
  for (let i = 0; i < _corrections.length; i++) {
    t = t.replace(_corrections[i][0], _corrections[i][1]);
  }

  // Fusión algorítmica de fragmentos restantes
  t = _fixFragmentedWords(t);

  // Capitalizar primera letra
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

// ── LLM-Assisted Polish ─────────────────────────────────────────────────────
// Llama a Gemini Flash directamente para pulir el texto transcripto.
const _LLM_TIMEOUT = JARVIS_CONFIG.autocorrect.llmTimeoutMs;
const _LLM_ENDPOINT = JARVIS_CONFIG.autocorrect.llmEndpoint;

/**
 * Detecta si el texto tiene problemas de transcripción que ameritan LLM polish:
 * - Palabras sueltas de 1-2 chars no válidas intercaladas
 * - Fragmentos fonéticos (sílabas sueltas)
 * - Alta relación de palabras ≤2 chars vs total
 */
function _needsLLMPolish(text) {
  if (!JARVIS_CONFIG.autocorrect.llmEnabled) return false;
  if (!text || text.length < 8) return false;
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return false;

  let suspicious = 0;
  for (const w of words) {
    const wl = w.toLowerCase().replace(/[^a-záéíóúñü]/g, '');
    // Palabra de 1-2 chars que no está en el vocabulario válido
    if (wl.length <= 2 && !_validShortWords.has(wl) && wl.length > 0) suspicious++;
    // Palabra de 3 chars que suena a sílaba suelta (no termina en vocal común)
    else if (wl.length === 3 && !_spanishWords.has(wl) && !_validShortWords.has(wl)) suspicious++;
  }

  // Si más del umbral configurado de las palabras son sospechosas, aplicar LLM
  return (suspicious / words.length) > JARVIS_CONFIG.autocorrect.suspiciousRatioThreshold;
}

/**
 * Polishes the transcript using Gemini Flash Lite (fastest model).
 * Returns the corrected text or null on failure/timeout.
 */
async function _llmPolish(rawText) {
  try {
    const apiKey = localStorage.getItem('jarvis_gemini_api_key') || '';
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), _LLM_TIMEOUT);

    const prompt = `Eres un corrector de transcripciones de voz en español. Tu única tarea es:
1. Corregir palabras mal transcritas o fragmentadas (ej: "eh qui sie ra" → "quisiera", "ehqui siera" → "quisiera").
2. Corregir errores fonéticos comunes del habla hispana.
3. Mantener el significado EXACTO del texto original.
4. NO agregar palabras que no estén implícitas en el texto.
5. NO cambiar el tono ni ampliar la oración.
6. Responde SOLO con el texto corregido, sin explicaciones, sin comillas, sin prefijos.

Texto a corregir: "${rawText}"`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 256,
        candidateCount: 1,
      },
    });

    const resp = await fetch(`${_LLM_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) return null;
    const data = await resp.json();
    const corrected = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!corrected || corrected.length < 2) return null;

    // Sanity check: el texto corregido no debe ser más del doble del original
    if (corrected.length > rawText.length * 2.5) return null;

    return corrected;
  } catch (_) {
    return null;
  }
}

/**
 * Versión async con LLM polish — usar para el commit final del mensaje de usuario.
 * Aplica regex primero, luego LLM si es necesario.
 * @param {string} rawText - Texto bruto de la transcripción
 * @returns {Promise<string>} Texto corregido
 */
async function autoCorrectSpanishAsync(rawText) {
  if (!rawText || rawText.length < 3) return rawText;

  // Paso 1: corrección regex rápida
  const regexCorrected = _cleanText(rawText);

  // Paso 2: si el texto aún parece fragmentado, aplicar LLM polish
  if (_needsLLMPolish(regexCorrected || rawText)) {
    const llmResult = await _llmPolish(regexCorrected || rawText);
    if (llmResult) {
      // Capitalizar primera letra del resultado LLM
      return llmResult.charAt(0).toUpperCase() + llmResult.slice(1);
    }
  }

  return regexCorrected || rawText;
}

function isNoiseTranscript(text) {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  if (/^([<\[\(])(noise|sigh|cough|throat-clearing|throat_clearing|laughter|applause|music|silence|whisper|pant|snort|yawn|groan)([>\]\)])$/.test(clean)) {
    return true;
  }
  if (/^[<\[\(][^\>\]\)]+[>\]\)]$/.test(clean)) {
    return true;
  }
  return false;
}

export { _cleanText as autoCorrectSpanish, autoCorrectSpanishAsync, _fixFragmentedWords, isNoiseTranscript };
