const _listeners = {};
const _onceListeners = {};
const _log = [];

export const bus = {
  on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return () => this.off(event, fn);
  },

  off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  },

  emit(event, data) {
    _log.push({ event, data, time: Date.now() });
    const arr = _listeners[event];
    if (arr) arr.forEach(fn => {
      try { fn(data, event); } catch (e) { console.warn(`[BUS] Error en listener ${event}:`, e); }
    });
    const once = _onceListeners[event];
    if (once) {
      once.forEach(fn => {
        try { fn(data, event); } catch (e) { console.warn(`[BUS] Error en once ${event}:`, e); }
      });
      delete _onceListeners[event];
    }
  },

  once(event, fn) {
    if (!_onceListeners[event]) _onceListeners[event] = [];
    _onceListeners[event].push(fn);
  },

  clear() {
    Object.keys(_listeners).forEach(k => delete _listeners[k]);
    Object.keys(_onceListeners).forEach(k => delete _onceListeners[k]);
  },

  getLog() { return _log.slice(); },

  getLogForEvent(event) { return _log.filter(e => e.event === event); }
};

export default bus;
