const _EN_WORDS = new Set([
  'i','i\'m','i\'ve','i\'ll','i\'d','we','we\'re','the','this','that','these','those',
  'is','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','could','should','must','shall','may','might','can','cannot',
  'my','our','your','their','his','her','its',
  'in','on','at','by','for','with','about','of','to','from','into','through',
  'and','but','or','nor','so','yet','both','either','neither',
  'not','no','yes','more','most','some','all','any','each','every','both',
  'think','know','understand','believe','feel','consider','recognize','interpret',
  'response','input','context','instruction','rule','pattern','format','message',
  'because','since','while','although','however','therefore','thus','hence',
  'previous','prior','current','next','final','initial','correct','best','ideal',
  'user\'s','user','system','model','assistant','ai','jarvis\'s',
  'seems','appear','seem','looks','suggest','indicate','confirm',
  'different','multiple','specific','general','strict','clear','direct',
  'within','without','according','based','given','following','using',
  'options','option','approach','method','style','tone',
  'sentence','word','phrase','text','paragraph','concise','brief',
  'maintain','ensure','adjust','consider','decide','determine','evaluate',
  'recognizing','interpreting','understanding','analyzing','processing',
  'its','it\'s','there\'s','here\'s','that\'s','what\'s','how\'s',
]);

export const EN_PURE_REASON = /^(?:The\s(?:model|system|AI|assistant|user|response|greeting|instruction|format)\s|I(?:'[a-z]+)?\s(?:need|should|will|am|must|can|cannot|think|know|understand|believe)|My\s(?:response|task|role|approach)|This\s(?:is\s+a|requires|means)|Based\s+on|Given\s+(?:the|that)|According\s+to)/i;

export function enWordRatio(text) {
  const words = text.toLowerCase().replace(/[^a-záéíóúüñ'\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 3) return 0;
  const enCount = words.filter(w => _EN_WORDS.has(w)).length;
  return enCount / words.length;
}

export function hasSpanish(text) {
  return /[ñáéíóúüÑÁÉÍÓÚÜ¿¡]/.test(text) || /\b(?:señor|usted|gracias|por\s+favor|cómo|qué|aquí|estoy|tengo|necesito|puedo|también|además|para|sobre|hola|sí|no|es|un|una|el|la|los|las|en|de|del|con|su|sus|mi|tu|al|lo|se|me|te|le|nos|les|yo|él|ella|ellos|ellas|nosotros|está|están|este|esta|esto|estos|estas|muy|bien|pero|o|y|como|cuando|donde|quién|cual|cuales|todo|todos|toda|todas|otro|otra|otros|otras)\b/i.test(text);
}
