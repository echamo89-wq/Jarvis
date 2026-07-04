export function createLogger(tag) {
  return function _log(type, msg) {
    const full = `[${tag}] ${msg}`;
    if (window.electronAPI?.logToTerminal) window.electronAPI.logToTerminal(type, full);
    if (type === 'error') console.error(full);
    else if (type === 'warn') console.warn(full);
    else console.log(full);
  };
}
