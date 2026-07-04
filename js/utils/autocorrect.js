const _corrections = [
  [/^enos(\s|$)/i, 'Buenos$1'],
  [/^en dia(\s|$)/i, 'Buen día$1'],
  [/^gervis\b/i, 'Jarvis'],
  [/\bgervis\b/i, 'Jarvis'],
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
];

const _fragmentPatterns = [
  [/\bmu y\b/gi, 'muy'],
  [/\ba ho ra\b/gi, 'ahora'],
  [/\baho rra\b/gi, 'ahora'],
  [/\bcce so\b/gi, 'acceso'],
  [/\bdi rec to\b/gi, 'directo'],
  [/\bdire cto\b/gi, 'directo'],
  [/\bNe cesito\b/g, 'Necesito'],
  [/\bInsta gram\b/gi, 'Instagram'],
  [/\bwhats app\b/gi, 'WhatsApp'],
  [/\byou tube\b/gi, 'YouTube'],
  [/\bface book\b/gi, 'Facebook'],
  [/\bspoti fy\b/gi, 'Spotify'],
  [/\bdisc ord\b/gi, 'Discord'],
  [/\btele gram\b/gi, 'Telegram'],
  [/\bpuede s\b/gi, 'puedes'],
  [/\bescu char\b/gi, 'escuchar'],
  [/\ba ten to\b/gi, 'atento'],
  [/\bM u y\b/gi, 'Muy'],
  [/(^|\s)me to do lo g(i|í)\S*(?=\s|$)/gi, '$1metodología'],
  [/(^|\s)me to dolo g(i|í)\S*(?=\s|$)/gi, '$1metodología'],
  [/(^|\s)meto dolo g(i|í)\S*(?=\s|$)/gi, '$1metodología'],
  [/\bpa ra\b/gi, 'para'],
  [/\bfun cio na\b/gi, 'funciona'],
  [/\bto do\b/gi, 'todo'],
  [/\blle gar\b/gi, 'llegar'],
  [/\bun fect\b/gi, 'un efecto'],
  [/\bfect\s+quí\b/gi, 'efecto quí'],
  [/\bquí mi co\b/gi, 'químico'],
  [/\bescu cha\b/gi, 'escucha'],
  [/\bne ce sito\b/gi, 'necesito'],
];

const _validShortWords = new Set([
  'a', 'e', 'i', 'o', 'u', 'y', 'el', 'la', 'lo', 'le', 'se',
  'de', 'en', 'un', 'su', 'tu', 'mi', 'nos', 'os', 'te', 'me',
  'por', 'con', 'sin', 'que', 'los', 'las', 'les', 'una', 'uno',
  'es', 'ya', 'al', 'del', 'no', 'si', 'se', 'va', 'ha', 'he',
  'has', 'han', 'hay', 'fue', 'era', 'ser', 'son', 'mas', 'pero',
  'como', 'para', 'esta', 'este', 'todo', 'bien', 'muy'
]);

function _fixFragmentedWords(text) {
  let t = text.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+([.,!?;:])/g, '$1');

  const words = t.split(' ');
  if (words.length < 2) return t;

  const result = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === '') continue;
    const current = words[i].toLowerCase();
    const isSingleConsonant = current.length === 1 && !'aeiouy'.includes(current);

    if (isSingleConsonant && i + 1 < words.length) {
      result.push(words[i] + words[i + 1]);
      i++;
      continue;
    }

    if (current.length >= 1 && current.length <= 2 && i + 1 < words.length) {
      const next = words[i + 1].toLowerCase();
      const combined = current + next;
      const currentValid = _validShortWords.has(current);

      if (_validShortWords.has(combined)) {
        result.push(words[i] + words[i + 1]); i++; continue;
      }
      if (!currentValid && next.length >= 1 && next.length <= 3 && combined.length >= 4) {
        result.push(words[i] + words[i + 1]); i++; continue;
      }
      if (current.length <= 2 && next.length <= 2 && !_validShortWords.has(next)) {
        result.push(words[i] + words[i + 1]); i++; continue;
      }
    }

    // Fusionar palabras de 3-5 + 2-5 caracteres si el resultado es una palabra válida conocida
    if (current.length >= 3 && current.length <= 5 && i + 1 < words.length) {
      const next = words[i + 1].toLowerCase();
      if (next.length >= 2 && next.length <= 5) {
        const combined = current + next;
        const fullWord = words[i] + words[i + 1];
        // Verificar si la combinación existe en los patrones de corrección
        const inCorrections = _corrections.some(c => {
          if (c[1].includes(fullWord)) return true;
          return false;
        });
        const inFragments = _fragmentPatterns.some(f => {
          const target = f[1].toLowerCase();
          return target === combined || target.includes(combined);
        });
        if (inCorrections || inFragments) {
          result.push(fullWord); i++; continue;
        }
      }
    }

    result.push(words[i]);
  }

  return result.join(' ');
}

function _cleanText(text) {
  if (!text) return '';
  let t = text;
  if (t.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').length < 2) return '';
  for (let i = 0; i < _fragmentPatterns.length; i++) {
    t = t.replace(_fragmentPatterns[i][0], _fragmentPatterns[i][1]);
  }
  for (let i = 0; i < _corrections.length; i++) {
    t = t.replace(_corrections[i][0], _corrections[i][1]);
  }
  t = _fixFragmentedWords(t);
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

function isNoiseTranscript(text) {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  // Filtra etiquetas de ruido comunes de Gemini/Whisper
  if (/^([<\[\(])(noise|sigh|cough|throat-clearing|throat_clearing|laughter|applause|music|silence|whisper|pant|snort|yawn|groan)([>\]\)])$/.test(clean)) {
    return true;
  }
  // Filtra cualquier texto que sea sólo una palabra entre símbolos
  if (/^[<\[\(][^>\]\)]+[>\]\)]$/.test(clean)) {
    return true;
  }
  return false;
}

export { _cleanText as autoCorrectSpanish, _fixFragmentedWords, isNoiseTranscript };
