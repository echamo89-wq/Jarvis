/**
 * Logger Centralizado para el Kernel de JARVIS.
 * Soporta niveles de log, sinks (consola, Electron terminal), buffer circular en memoria y rate limiting.
 */

import { JARVIS_CONFIG } from '../config/jarvis.config.js';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let _currentLevel = LOG_LEVELS.INFO;
const BUFFER_LIMIT = JARVIS_CONFIG.logger.bufferLimit;
const _logBuffer = [];

// Rate limiting para suprimir logs repetitivos idénticos
const RATE_LIMIT_WINDOW_MS = JARVIS_CONFIG.logger.rateLimitWindowMs;
const _lastLogs = new Map(); // key -> timestamp

export function getLogLevels() {
  return { ...LOG_LEVELS };
}

export function setLogLevel(levelName) {
  const name = levelName.toUpperCase();
  if (LOG_LEVELS[name] !== undefined) {
    _currentLevel = LOG_LEVELS[name];
  }
}

export function getLogLevel() {
  return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === _currentLevel);
}

export function createLogger(tag) {
  return {
    debug(msg, meta) { _log(LOG_LEVELS.DEBUG, tag, msg, meta); },
    info(msg, meta)  { _log(LOG_LEVELS.INFO, tag, msg, meta); },
    warn(msg, meta)  { _log(LOG_LEVELS.WARN, tag, msg, meta); },
    error(msg, meta) { _log(LOG_LEVELS.ERROR, tag, msg, meta); }
  };
}

export function getLogs() {
  return _logBuffer.slice();
}

export function clearLogs() {
  _logBuffer.length = 0;
}

// ─── Internals ─────────────────────────────────────────────────────────────────

function _log(level, tag, msg, meta) {
  if (level < _currentLevel) return;

  // Rate Limiting para evitar logs redundantes
  const logKey = `${tag}:${msg}:${level}`;
  const now = Date.now();
  if (_lastLogs.has(logKey)) {
    const lastTime = _lastLogs.get(logKey);
    if (now - lastTime < RATE_LIMIT_WINDOW_MS) {
      return; // Suprimir log repetitivo en ventana de tiempo
    }
  }
  _lastLogs.set(logKey, now);

  const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
  const logEntry = {
    timestamp: now,
    level: levelName,
    tag,
    message: msg,
    meta: meta ? _sanitizeMeta(meta) : null
  };

  // Buffer circular
  _logBuffer.push(logEntry);
  if (_logBuffer.length > BUFFER_LIMIT) {
    _logBuffer.shift();
  }

  // Formato del mensaje
  const timeString = new Date(now).toISOString().substring(11, 23);
  const metaStr = meta ? ` | ${JSON.stringify(logEntry.meta)}` : '';
  const formattedMsg = `[${timeString}] [${levelName}] [${tag}] ${msg}${metaStr}`;

  // Enviar a Sinks
  // 1. Electron terminal (IPC)
  if (window.electronAPI?.logToTerminal) {
    const type = levelName === 'ERROR' ? 'error' : levelName === 'WARN' ? 'warn' : 'info';
    window.electronAPI.logToTerminal(type, formattedMsg);
  }

  // 2. Consola del navegador — solo si NO estamos en Electron (evita duplicado con logToTerminal)
  if (!window.electronAPI?.logToTerminal) {
    if (level === LOG_LEVELS.ERROR) {
      console.error(formattedMsg);
    } else if (level === LOG_LEVELS.WARN) {
      console.warn(formattedMsg);
    } else {
      console.log(formattedMsg);
    }
  }

  // 3. Emitir evento vía bus si ya está inicializado para observabilidad
  try {
    if (window._jarvisKernel?.bus) {
      window._jarvisKernel.bus.emit('kernel:log', logEntry);
    }
  } catch {}
}

function _sanitizeMeta(meta) {
  try {
    // Evitar estructuras circulares o muy grandes
    return JSON.parse(JSON.stringify(meta));
  } catch {
    return '[Unserializable Meta]';
  }
}
