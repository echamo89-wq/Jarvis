import { hasSpanish, enWordRatio, EN_PURE_REASON } from '../utils/text-utils.js';
import { createLogger } from '../utils/logger.js';
const _log = createLogger('CHAT');

export function _convLog(type, msg) {
  if (window.electronAPI?.logToTerminal) window.electronAPI.logToTerminal(type, msg);
}

export function _cleanModelText(text) {
  if (!text || !text.trim()) return '';
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (EN_PURE_REASON && EN_PURE_REASON.test(text)) {
    const q = text.match(/"([^"]+)"/g);
    if (q) {
      const esqs = q.map(s => s.replace(/"/g, '')).filter(s => hasSpanish && hasSpanish(s));
      if (esqs.length > 0) return esqs.join('. ');
    }
    if (!hasSpanish || !hasSpanish(text)) return '';
  }
  if (enWordRatio && hasSpanish) {
    const enRatio = enWordRatio(text);
    if (enRatio > 0.70 && !hasSpanish(text)) return '';
  }
  text = text
    .replace(/`[^`]+`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^\s*[|]\s*/gm, '')
    .trim();
  return text;
}

export function _separateThinkingAndResponse(text) {
  if (!text || !text.trim()) return { thinking: '', response: '' };
  const thinkTagRegex = /<think>([\s\S]*?)<\/think>/gi;
  const thinkingParts = [];
  let cleanText = text.replace(thinkTagRegex, (_, inner) => { thinkingParts.push(inner.trim()); return ''; });
  cleanText = cleanText.replace(/^\*\*[^*]+\*\*\s*/gm, '').replace(/\*\*/g, '');
  const REASONING_PATTERNS = [
    /^(voy a|vamos a|necesito|debo|tengo que|usaré|mi plan es|procedo a)/i,
    /^para (responder|contestar|obtener|encontrar|saber|verificar|comprobar)/i,
    /^(analizando|revisando|consultando|verificando|comprobando|determinando|considerando|evaluando|pensando|planeando|examinando)/i,
    /^(el usuario|la usuaria|la consulta|la petición|la pregunta|el mensaje).*(ha |está |quiere |pregunta |dice |solicita)/i,
    /^(primero |luego |finalmente |después |antes ).*(voy|vamos|necesito|debo|procedo|paso)/i,
    /^déjame|permíteme|dame un momento|un momento/i,
    /^bueno,? (voy|vamos|déjame|procedo)/i,
    /^ok,? (voy|vamos|déjame|procedo)/i,
    /^muy bien,? (voy|vamos)/i,
    /^(como |tal que |de manera que |para que ).*(pueda|puedo|necesito)/i,
    /^(I'm (going|now|currently|focusing|aiming|about|trying)|I will|I'll|I need|I should|let me|my plan is|I think|I believe|I'd like|my (goal|aim|focus|objective|next step) is)/i,
    /^(I've|i have) (refined|crafted|created|generated|focused|analyzed|determined|identified|found|decided|now|just)/i,
    /^i (focused|analyzed|determined|identified|looked|started|began|decided|chose|selected|took|made|considered|thought|realized|noticed)/i,
    /^(analyzing|determining|the user|i understand|i'm about|let's|first|second|finally|next|now (i'm|i will|let's|i've|i have))/i,
    /^(to (respond|answer|get|find|check|verify|determine|look|create|generate|craft|produce|formulate))/i,
    /^(the user|the question|the request|the query).*(has |is |wants |asks |says|asked|wanted|said)/i,
    /^(the|this|that) (spanish|english|french|german|italian|portuguese|user's|original) (phrase|word|sentence|request|query|question).*(translate|mean|refers|represents|indicates|express)/i,
    /^(crafting|creating|generating|formulating|building|preparing|working on|putting together|writing|developing|designing|refining|adjusting|modifying|improving|enhancing|reviewing|checking|finalizing)/i,
    /^(my next|the next|next,? i|now i('?ve| will| can| need| should| want| must| have to))/i,
    /\b(tool result|function response|json data|api call|fetching|searching|here is (my|the|a) (response|answer|prompt|result))\b/i,
    /^considerando|revisando datos|procesando|preparando/i,
  ];
  const sentences = cleanText.split(/(?<=[.!?])\s+/);
  const responseLines = [];
  for (const sent of sentences) {
    const s = sent.trim();
    if (!s) continue;
    const secondPerson = /\b(te |le |les |tú |usted |you |your |señor|señora|amigo)/i.test(s);
    if (secondPerson) { responseLines.push(s); continue; }
    const isReasoning = REASONING_PATTERNS.some(p => p.test(s));
    if (isReasoning) {
      const hasIntentToRespond = /\b(I'?ll|I'?m going|let me|I will)\b.*\b(you|your|for|this|here|the)\b/i.test(s);
      if (hasIntentToRespond) responseLines.push(s);
      else thinkingParts.push(s);
    }
    else responseLines.push(s);
  }
  return {
    thinking: thinkingParts.join(' ').trim(),
    response: responseLines.join(' ').replace(/\s+/g, ' ').trim()
  };
}

export function updateThinkingPanel(text) {
  const thinkingBody = document.getElementById('thinking-body');
  if (!thinkingBody) return;
  const prev = thinkingBody.innerText;
  thinkingBody.innerText = text && text.trim() ? text : 'Sin procesos activos.';
  if (text && text.trim() && text !== prev) {
    _convLog('conv_think', text.substring(0, 200));
    thinkingBody.scrollTop = thinkingBody.scrollHeight;
  }
}

export function _extractTitle(text) {
  const headerMatch = text.match(/^\s*#\s+(.+)/m);
  if (headerMatch) return headerMatch[1].substring(0, 60).trim();
  const firstSentence = text.replace(/\n+/g, ' ').trim().match(/^(.{10,100}?)[.!?]/);
  if (firstSentence) return firstSentence[1].trim();
  return 'Informe';
}

export function extractCodeBlocks(text) {
  if (!text) return [];
  const blocks = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const lang = match[1] || 'text';
    const code = match[2].trim();
    if (!code) continue;
    const lines = code.split('\n');
    const title = lines[0]?.trim()?.match(/^\/\/\s*(.+)/) || lines[0]?.trim()?.match(/^#\s*(.+)/);
    const name = title ? title[1].trim() : `codigo-${blocks.length + 1}.${lang}`;
    blocks.push({ lang, code, title: name });
  }
  return blocks;
}
