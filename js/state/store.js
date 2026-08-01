import { STATE, isValidTransition, EVENTS } from './constants.js';

const _listeners = {};

const _state = {
  machine: STATE.IDLE,
  toolCount: 0,
  toolStartTime: null,
  waitingForResponse: false,
  activeSources: [],
  jarvisSpeakingSince: 0,
  isJarvisMuted: false,
  messageCount: 0,
  conversationHistory: [],
  startTime: 0,
  lastWsMessageTime: 0,
  isReconnectingIntentional: false,
  userMemory: null,
  _lastInputTranscript: '',
  _currentTurnTextBuffer: '',
  _turnState: 'thinking',
  _thinkingPhaseStartTime: 0,
  _turnHasAudio: false,
  _jarvisSpeechText: '',
  focusMode: true,
  isTtsSpeaking: false,
  // Keys usadas en la app sin default anterior
  _textInputMode: false,
  _reconnectCooldown: false,
  _meetingMode: false,
  _turnTextShown: false,
  _currentTurnTokenBuffer: '',
  waitingForGreetingToFinish: false,
  _lastPlaybackEnded: 0,
  userVoice: 'Fenrir',
  alwaysOn: false,
  graphicsQuality: 'high',
  _activeProvider: 'gemini',
  _wsConnecting: false,
  _wsReconnectPending: false,
  _wsMaxRetriesExhausted: false,
  _lastAskRepeat: '',
  homeDir: ''
};

function _emit(key, value, prev) {
  const ev = key === 'machine' ? EVENTS.STATE_CHANGED : `change:${key}`;
  const arr = _listeners[ev];
  if (arr) arr.forEach(fn => { try { fn(value, prev, key); } catch (e) { console.warn('[STORE] Error en listener:', e); } });
  const all = _listeners['*'];
  if (all) all.forEach(fn => { try { fn(key, value, prev); } catch (e) { console.warn('[STORE] Error en listener *:', e); } });
}

export const store = {
  get(key) {
    return key ? _state[key] : { ..._state };
  },

  set(key, value) {
    const prev = _state[key];
    if (prev === value) return;
    _state[key] = value;
    _emit(key, value, prev);
  },

  setState(next, context) {
    const prev = _state.machine;
    if (prev === next) return;
    if (!isValidTransition(prev, next)) {
      console.warn(`[STATE] Transición inválida: ${prev} → ${next}`);
      return;
    }
    _state.machine = next;
    _emit('machine', next, prev);
    if (window.JarvisSupervisor) window.JarvisSupervisor.record('state', { from: prev, to: next, context });
  },

  getState() {
    return _state.machine;
  },

  on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return () => this.off(event, fn);
  },

  off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  },

  once(event, fn) {
    const wrapper = (value, prev, key) => {
      fn(value, prev, key);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  },

  reset() {
    Object.keys(_state).forEach(k => {
      if (k === 'userMemory') return;
      _state[k] = typeof _state[k] === 'number' ? 0 :
                   typeof _state[k] === 'boolean' ? false :
                   Array.isArray(_state[k]) ? [] :
                   typeof _state[k] === 'string' ? '' : _state[k];
    });
    _state.machine = STATE.IDLE;
  }
};

// Global reference for non-module scripts (supervisor.js) — read-only wrappers
if (typeof window !== 'undefined') {
  window.getState = () => _state.machine;
  window.getCtx = (key) => key ? _state[key] : undefined;
  window.setCtx = (key, value) => { store.set(key, value); };
  window.setJarvisState = (s) => store.setState(s === 'speaking' || s === 'talking' ? STATE.SPEAKING : s);
}
