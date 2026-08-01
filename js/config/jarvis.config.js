// ──────────────────────────────────────────────────────────────────
// jarvis.config.js — Configuración centralizada para JARVIS
// ──────────────────────────────────────────────────────────────────

export const JARVIS_CONFIG = {
  // ── Gemini / AI ──────────────────────────────────────────
  ai: {
    model: 'models/gemini-2.5-flash-native-audio-latest',
    defaultVoice: 'Fenrir',
    temperature: 0.5,
    topP: 0.85,
  },

  // ── VAD (Voice Activity Detection) ───────────────────────
  vad: {
    disabled: false,
    // MAX sensitivity: captura todo lo que dices, incluso frases muy cortas
    startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
    endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
    // Padding mínimo para no cortar el inicio de la frase
    prefixPaddingMs: 0,
    // Silencio muy corto = responde más rápido al terminar de hablar
    silenceDurationMs: 80,
  },

  // ── Autocorrección ────────────────────────────────────────
  autocorrect: {
    llmEnabled: true,
    llmModel: 'gemini-2.5-flash',
    llmEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    // Tiempo límite reducido: si tarda más de 900ms, descartamos el polish (respuesta antes)
    llmTimeoutMs: 900,
    // Umbral más bajo: aplicar LLM polish en más casos para mayor precisión
    suspiciousRatioThreshold: 0.18,
  },

  // ── Investigación / Research ──────────────────────────────
  research: {
    translateEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    translateTimeoutMs: 5000,
    translateChunkSize: 1500,
    dedupThreshold: 0.6,
    maxResultsPerSource: 5,
    maxTotalSources: 12,
  },

  // ── WebSocket / Reconexión ────────────────────────────────
  ws: {
    connectTimeoutMs: 25000,
    reconnectMaxAttempts: 15,
    reconnectMaxBackoffMs: 15000,
    reconnectJitterMs: 500,
    cacheTtlMs: 60000,
  },

  // ── Logger ────────────────────────────────────────────────
  logger: {
    bufferLimit: 500,
    rateLimitWindowMs: 2000,
  },
};
