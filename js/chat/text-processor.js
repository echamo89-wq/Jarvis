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

  const INTERNAL_NARRATIVE = [
    // Español — narrativa de proceso
    /^(voy a|vamos a|necesito|debo|tengo que|usaré|mi plan es|procedo a)/i,
    /^para (responder|contestar|obtener|encontrar|saber|verificar|comprobar)/i,
    /^(analizando|revisando|consultando|verificando|comprobando|determinando|considerando|evaluando|pensando|planeando|examinando|procesando|preparando)/i,
    /^(el usuario|la usuaria|la consulta|la petición|la pregunta|el mensaje).*(ha |está |quiere |pregunta |dice |solicita)/i,
    /^déjame|permíteme|dame un momento/i,
    /^considerando|revisando datos|procesando|preparando/i,

    // Inglés — "I'm doing X", "I've done Y", "My plan..."
    /^(i'm |i am |i will |i'll |i've |i have |i need to |i should |i must |i can |i want |i\'?d like |let me |my (plan|goal|aim|focus|objective|next step|priority|approach|strategy|method) (is|was|will be))/i,
    /^(i (focused|analyzed|determined|identified|looked|started|began|decided|chose|selected|took|made|considered|thought|realized|noticed|understood|recognized|examined|checked|verified|confirmed|found|discovered|noted|attempted|tried|attempted|proceeded|continued|moved|switched|pivoted|shifted))/i,
    /^(the (user|question|request|query|input|message|command|instruction|task|goal)).*(has |is |was |wants |asks |says |asked |wanted |said |requested|indicates|refers|represents|expresses|can be|should be|needs|requires)/i,
    /^(analyzing|determining|identifying|checking|verifying|confirming|examining|considering|evaluating|assessing|reviewing|looking|searching|fetching|retrieving|gathering|collecting|compiling|preparing|formulating|crafting|creating|generating|building|writing|developing|designing|refining|adjusting|modifying|improving|enhancing|finalizing|planning|outlining|summarizing)/i,
    /^(to (respond|answer|get|find|check|verify|determine|look|create|generate|craft|produce|formulate|address|handle|process|understand|identify|confirm|ensure|make|provide|give|offer|present|show|demonstrate|explain|clarify|elaborate))/i,
    /^(my next|the next|next,? i|now i('?ve| will| can| need| should| want| must| have to|am going))/i,
    /^(the|this|that) (spanish|english|french|german|response|answer|prompt|text|phrase|word|sentence) (should|will|needs|must|can|could|would)/i,

    // Frases completas de autodiálogo
    /^i('ve| have) (determined|found|decided|concluded|identified|noticed|realized|understood) (that |the |this |it )/i,
    /^(this tool|the tool|this function|the function) (seems|looks|is|was|has|appears|should|will|can)/i,
    /^(i('?ve| have) (hit|encountered|run into|experienced|noticed|seen) (a |an |some ))/i,
    /^(my response|my answer|the response|the answer|the output) (should|will|would|could|needs|must|is|was)/i,
    /^(the (most|best|correct|right|proper|ideal|perfect|optimal|appropriate|suitable).*(way|approach|method|solution|course|action|step).*(is|would be|will be|should be))/i,
    /^(this (is|was|has been|will be) (a |an |the |my ))/i,
    /^(based on|given|considering|looking at|according to|following|after).*(the (user|request|query|input|result|output|data|information|context|situation|analysis))/i,
    /^(i'll (now|then|next|proceed|start|begin|attempt|try|go ahead|continue|move))/i,
    /^(?:i'?ve|i have) (decided|chosen|opted|selected|elected) to/i,
    /^(the (next|following|subsequent) (step|action|phase|stage|part|section) (is|will be|should be|would be))/i,
    /^(here is|here's|this is|that is) (my|the|a) (analysis|assessment|evaluation|breakdown|summary|overview|plan|approach|strategy|response|answer|reply)/i,
    /^(i (interpret|understand|believe|think|consider|view|see|perceive|recognize|acknowledge) (this|that|the|it|your|the user's))/i,

    // Headers de narrativa interna
    /^\*\*[^*]+\*\*\s*$/,
    /^(clarifying|interpreting|processing|analyzing|determining|investigating|researching|searching|planning|preparing|formulating|crafting|creating|generating|building|writing|developing|designing|refining|adjusting|improving|enhancing|finalizing) /i,
  ];

  const sentences = cleanText.split(/(?<=[.!?])\s+/);
  const responseLines = [];
  for (const sent of sentences) {
    const s = sent.trim();
    if (!s) continue;

    // Skip markdown headers of self-narration (e.g. **Analyzing...**, **Processing...**)
    if (/^\*\*[^*]+\*\*$/.test(s.replace(/[.!?]/g, '').trim())) { thinkingParts.push(s); continue; }

    // If it's directly addressing the user (has 2nd person pronouns), it's response
    const secondPerson = /\b(te |le |les |tú |usted |you\b|your\b|señor|señora|amigo)/i.test(s);

    // Check if sentence is internal narration
    const isNarration = INTERNAL_NARRATIVE.some(p => p.test(s));

    if (isNarration && !secondPerson) {
      thinkingParts.push(s);
    } else {
      responseLines.push(s);
    }
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
