export const STATE = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  SPEAKING: 'speaking',
  WORKING: 'working',
  ERROR: 'error'
});

const _VALID_TRANSITIONS = {
  [STATE.IDLE]: [STATE.CONNECTING, STATE.LISTENING, STATE.SPEAKING, STATE.WORKING, STATE.ERROR],
  [STATE.CONNECTING]: [STATE.IDLE, STATE.LISTENING, STATE.ERROR],
  [STATE.LISTENING]: [STATE.SPEAKING, STATE.WORKING, STATE.IDLE, STATE.ERROR],
  [STATE.SPEAKING]: [STATE.LISTENING, STATE.WORKING, STATE.IDLE, STATE.ERROR],
  [STATE.WORKING]: [STATE.SPEAKING, STATE.LISTENING, STATE.IDLE, STATE.ERROR],
  [STATE.ERROR]: [STATE.IDLE, STATE.CONNECTING]
};

export function isValidTransition(from, to) {
  const valid = _VALID_TRANSITIONS[from];
  return valid ? valid.includes(to) : false;
}

export const EVENTS = {
  STATE_CHANGED: 'state:changed',
  TOOL_EXECUTING: 'tool:executing',
  TOOL_COMPLETE: 'tool:complete',
  AUDIO_START: 'audio:start',
  AUDIO_END: 'audio:end',
  AUDIO_CHUNK: 'audio:chunk',
  MIC_STARTED: 'mic:started',
  MIC_STOPPED: 'mic:stopped',
  WS_CONNECTED: 'ws:connected',
  WS_DISCONNECTED: 'ws:disconnected',
  WS_ERROR: 'ws:error',
  WS_MESSAGE: 'ws:message',
  USER_MESSAGE: 'chat:user-message',
  JARVIS_MESSAGE: 'chat:jarvis-message',
  CHAT_CLEARED: 'chat:cleared',
  CONFIG_SAVED: 'config:saved',
  CONFIG_LOADED: 'config:loaded',
  NOTIFICATION: 'system:notification',
  ERROR: 'system:error'
};
