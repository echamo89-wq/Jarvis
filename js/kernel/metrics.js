/**
 * Metrics Manager del Kernel de JARVIS.
 * Monitorea latencias del WS, tiempos de ejecución de herramientas, uso de memoria, tasa de errores y calcula un health score.
 */

import { bus } from './event-bus.js';
import { createLogger } from './logger.js';

const _log = createLogger('METRICS');

const _metrics = {
  wsLatencyMs: 0,
  toolDurations: {}, // toolName -> array of durations (last 10)
  totalErrors: 0,
  errorsPerMinute: 0,
  startTime: Date.now(),
  lastToolCallTime: 0,
  toolSuccessRate: 100,
  totalToolsRun: 0,
  failedToolsCount: 0
};

// Historial de errores por ventana de tiempo para la tasa por minuto
const _errorTimestamps = [];
const ERROR_WINDOW_MS = 60000;

export const metricsManager = {
  init() {
    _log.info('Metrics Manager inicializado.');

    // Conectar con el Event Bus para recolectar métricas automáticamente
    bus.on('ws:message', () => {
      // Si el mensaje incluye algún tipo de timestamp de ida y vuelta, o estimamos simple latencia
    });

    bus.on('state:changed', ({ to }) => {
      if (to === 'error') {
        this.recordError();
      }
    });

    bus.on('tool:start', () => {
      _metrics.totalToolsRun++;
      _metrics.lastToolCallTime = Date.now();
    });

    bus.on('tool:done', ({ name, duration }) => {
      this.recordToolDuration(name, duration);
      this._updateSuccessRate();
    });

    bus.on('tool:error', ({ name }) => {
      _metrics.failedToolsCount++;
      this.recordError();
      this._updateSuccessRate();
    });
  },

  recordWsLatency(ms) {
    _metrics.wsLatencyMs = ms;
    bus.emit('metrics:updated', this.getReport());
  },

  recordToolDuration(toolName, ms) {
    if (!_metrics.toolDurations[toolName]) {
      _metrics.toolDurations[toolName] = [];
    }
    const list = _metrics.toolDurations[toolName];
    list.push(ms);
    if (list.length > 10) {
      list.shift();
    }
  },

  recordError() {
    _metrics.totalErrors++;
    const now = Date.now();
    _errorTimestamps.push(now);
    this._pruneErrors(now);
    _metrics.errorsPerMinute = _errorTimestamps.length;
    bus.emit('metrics:updated', this.getReport());
  },

  getReport() {
    const now = Date.now();
    this._pruneErrors(now);
    _metrics.errorsPerMinute = _errorTimestamps.length;

    return {
      uptimeSeconds: Math.round((now - _metrics.startTime) / 1000),
      wsLatencyMs: _metrics.wsLatencyMs,
      errorsPerMinute: _metrics.errorsPerMinute,
      totalErrors: _metrics.totalErrors,
      toolSuccessRate: _metrics.toolSuccessRate,
      healthScore: this.calculateHealthScore(),
      memory: this._getMemoryUsage()
    };
  },

  calculateHealthScore() {
    let score = 100;

    // Penalización por errores activos por minuto
    score -= _metrics.errorsPerMinute * 15;

    // Penalización por tasa de éxito de herramientas
    const toolFailureRate = 100 - _metrics.toolSuccessRate;
    score -= toolFailureRate * 2;

    // Penalización por latencia excesiva en WS
    if (_metrics.wsLatencyMs > 500) {
      score -= Math.min(20, Math.round((_metrics.wsLatencyMs - 500) / 50));
    }

    return Math.max(0, Math.min(100, score));
  },

  // ─── Internos ─────────────────────────────────────────────────────────────────

  _pruneErrors(now) {
    while (_errorTimestamps.length > 0 && now - _errorTimestamps[0] > ERROR_WINDOW_MS) {
      _errorTimestamps.shift();
    }
  },

  _updateSuccessRate() {
    if (_metrics.totalToolsRun === 0) return;
    _metrics.toolSuccessRate = Math.round(
      ((_metrics.totalToolsRun - _metrics.failedToolsCount) / _metrics.totalToolsRun) * 100
    );
  },

  _getMemoryUsage() {
    if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
      return {
        usedJSHeapSize: Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024)),
        totalJSHeapSize: Math.round(window.performance.memory.totalJSHeapSize / (1024 * 1024)),
        jsHeapSizeLimit: Math.round(window.performance.memory.jsHeapSizeLimit / (1024 * 1024))
      };
    }
    return null;
  }
};

export default metricsManager;
