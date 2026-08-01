// ──────────────────────────────────────────────────────────────────
// schema.js — Documentación y validación del esquema del store
// ──────────────────────────────────────────────────────────────────

/**
 * Esquema descriptivo del estado global de JARVIS.
 * Utiliza store.get(key) y store.set(key, value) para interactuar.
 */
export const STATE_SCHEMA = {
  // ── Núcleo y Máquina de Estados ──────────────────────────────
  machine: {
    type: 'String',
    description: 'Estado actual de la máquina de estados central (IDLE, CONNECTING, LISTENING, SPEAKING, WORKING, ERROR).'
  },
  toolCount: {
    type: 'Number',
    description: 'Cantidad de llamadas a herramientas en ejecución en el turno actual.'
  },
  toolStartTime: {
    type: 'Number|null',
    description: 'Timestamp en ms del momento en que se inició la ejecución del bloque de herramientas actual.'
  },
  waitingForResponse: {
    type: 'Boolean',
    description: 'Bandera de espera de respuesta del servidor (usada para calcular latencia).'
  },
  activeSources: {
    type: 'Array',
    description: 'Lista de fuentes de reproducción de audio activas actualmente.'
  },

  // ── Diagnósticos y Latencias ──────────────────────────────────
  jarvisSpeakingSince: {
    type: 'Number',
    description: 'Timestamp en ms de cuándo empezó Jarvis a hablar en el turno actual.'
  },
  isJarvisMuted: {
    type: 'Boolean',
    description: 'Determina si la salida de audio PCM está silenciada.'
  },
  messageCount: {
    type: 'Number',
    description: 'Número acumulado de mensajes en la sesión actual.'
  },
  startTime: {
    type: 'Number',
    description: 'Timestamp del inicio de la sesión o de la petición.'
  },
  lastWsMessageTime: {
    type: 'Number',
    description: 'Timestamp del último mensaje recibido por WebSocket.'
  },

  // ── Historial y Memoria ──────────────────────────────────────
  conversationHistory: {
    type: 'Array',
    description: 'Historial de turnos de la sesión en formato [{ role: "user"|"model", content: string }].'
  },
  userMemory: {
    type: 'Object|null',
    description: 'Objeto de memoria persistente leído del archivo en disco (perfil del usuario).'
  },

  // ── Transcripciones Interim y Buffers de Turno ───────────────
  _lastInputTranscript: {
    type: 'String',
    description: 'Última transcripción del usuario confirmada e impresa.'
  },
  _currentTurnTextBuffer: {
    type: 'String',
    description: 'Acumulador de texto de respuesta del modelo en el turno actual.'
  },
  _turnState: {
    type: 'String',
    description: 'Sub-estado del turno de Jarvis ("thinking", "responding").'
  },
  _thinkingPhaseStartTime: {
    type: 'Number',
    description: 'Timestamp de inicio del estado de pensamiento.'
  },
  _turnHasAudio: {
    type: 'Boolean',
    description: 'Determina si el turno actual del modelo incluyó salida de audio PCM.'
  },
  _jarvisSpeechText: {
    type: 'String',
    description: 'Acumulador total del transcript de salida de Jarvis.'
  },

  // ── Modos Especiales y Banderas de Conexión ──────────────────
  focusMode: {
    type: 'Boolean',
    description: 'Determina si la ventana está en modo foco (prioriza control por voz).'
  },
  isTtsSpeaking: {
    type: 'Boolean',
    description: 'Indica si el motor de síntesis local (TTS) está reproduciendo texto.'
  },
  _textInputMode: {
    type: 'Boolean',
    description: 'Indica si la interacción actual se realiza a través de entrada de texto directo.'
  },
  _reconnectCooldown: {
    type: 'Boolean',
    description: 'Evita colisiones de reconexión WebSocket consecutivas en ráfaga.'
  },
  _meetingMode: {
    type: 'Boolean',
    description: 'Modo reunión activo (apaga el micrófono y silencia a Jarvis).'
  },
  _turnTextShown: {
    type: 'Boolean',
    description: 'Determina si el texto del turno ya fue mostrado en pantalla.'
  },
  waitingForGreetingToFinish: {
    type: 'Boolean',
    description: 'Bandera que indica que Jarvis está diciendo el saludo inicial.'
  },
  alwaysOn: {
    type: 'Boolean',
    description: 'Mantiene a Jarvis siempre escuchando y encima de otras ventanas.'
  },
  graphicsQuality: {
    type: 'String',
    description: 'Nivel de calidad de partículas y transiciones visuales (low, medium, high, ultra).'
  },
  _activeProvider: {
    type: 'String',
    description: 'Proveedor de IA activo (siempre "gemini").'
  },
  _wsConnecting: {
    type: 'Boolean',
    description: 'Indica si se está negociando una nueva conexión WebSocket.'
  },
  _wsReconnectPending: {
    type: 'Boolean',
    description: 'Indica si hay un timer de reconexión programado.'
  },
  _wsMaxRetriesExhausted: {
    type: 'Boolean',
    description: 'Bandera que previene loops infinitos si la clave API es errónea o no hay red.'
  }
};
