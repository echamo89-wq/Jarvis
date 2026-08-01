import { createLogger } from '../../../utils/logger.js';
const _log = createLogger('REFLECTOR');

export class Reflector {
  constructor() {
    this._history = [];
  }

  addEvent(stepId, desc, error, attempt, context = {}) {
    this._history.push({
      stepId,
      desc,
      error,
      attempt,
      context,
      timestamp: Date.now()
    });
    _log('warn', `[REFLEXIÓN] Paso "${desc}" falló (intento ${attempt}): ${error}`);
  }

  analyze(stepId, desc, error) {
    const events = this._history.filter(e => e.stepId === stepId);
    const errorLower = (error || '').toLowerCase();

    const analysis = {
      stepId,
      desc,
      error,
      attempts: events.length + 1,
      patterns: [],
      suggestions: []
    };

    if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
      analysis.patterns.push('timeout');
      analysis.suggestions.push('Aumentar tiempo de espera o simplificar la operación');
    }
    if (errorLower.includes('permiso') || errorLower.includes('permission') || errorLower.includes('access denied') || errorLower.includes('EACCES')) {
      analysis.patterns.push('permisos');
      analysis.suggestions.push('Ejecutar con permisos de administrador o cambiar la ruta de destino');
    }
    if (errorLower.includes('not found') || errorLower.includes('no such file') || errorLower.includes('no encontrado')) {
      analysis.patterns.push('recurso_inexistente');
      analysis.suggestions.push('Verificar que el archivo/ruta existe antes de continuar');
    }
    if (errorLower.includes('network') || errorLower.includes('connection') || errorLower.includes('econnrefused') || errorLower.includes('econnreset')) {
      analysis.patterns.push('red');
      analysis.suggestions.push('Verificar conexión a internet, reintentar con backoff exponencial');
    }
    if (errorLower.includes('memory') || errorLower.includes('heap') || errorLower.includes('allocation')) {
      analysis.patterns.push('memoria');
      analysis.suggestions.push('Cerrar otras aplicaciones para liberar memoria del sistema');
    }
    if (errorLower.includes('api') || errorLower.includes('rate limit') || errorLower.includes('429') || errorLower.includes('quota')) {
      analysis.patterns.push('api_limit');
      analysis.suggestions.push('Esperar antes de reintentar, reducir frecuencia de llamadas');
    }

    if (analysis.patterns.length === 0) {
      analysis.patterns.push('desconocido');
      analysis.suggestions.push('Revisar los parámetros de la herramienta y reintentar con enfoque diferente');
    }

    if (analysis.attempts >= 3) {
      analysis.suggestions.push('Cambiar de estrategia: intentar con otra herramienta o enfoque completamente diferente');
    }

    _log('info', `[REFLEXIÓN] Análisis para "${desc}": ${analysis.patterns.join(', ')}`);
    return analysis;
  }

  shouldReplan(stepId) {
    const events = this._history.filter(e => e.stepId === stepId);
    if (events.length >= 3) return true;
    const lastTwo = events.slice(-2);
    if (lastTwo.length >= 2 && lastTwo[0].error === lastTwo[1].error) return true;
    return false;
  }

  suggestAlternate(stepId, desc, error, availableTools) {
    const analysis = this.analyze(stepId, desc, error);
    const errorLower = error.toLowerCase();

    const alternatives = [];
    if (errorLower.includes('launch') || errorLower.includes('open') || errorLower.includes('start')) {
      if (availableTools.includes('execute_powershell')) {
        alternatives.push({ tool: 'execute_powershell', args: { command: `Start-Process "${desc.replace('Abrir ', '').replace('abrir ', '')}"` }, reason: 'Intentar con PowerShell en lugar de launch_app' });
      }
    }
    if (errorLower.includes('file') || errorLower.includes('archivo')) {
      if (availableTools.includes('execute_powershell')) {
        alternatives.push({ tool: 'execute_powershell', args: { command: `Get-Item "${desc}" -ErrorAction SilentlyContinue` }, reason: 'Verificar existencia del archivo con PowerShell' });
      }
    }
    if (errorLower.includes('search') || errorLower.includes('buscar') || errorLower.includes('web')) {
      if (availableTools.includes('fetch_url')) {
        alternatives.push({ tool: 'fetch_url', args: { url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(desc)}` }, reason: 'Intentar con fetch_url como alternativa de búsqueda' });
      }
    }

    return {
      analysis,
      alternatives: alternatives.length > 0 ? alternatives : [{ tool: null, args: {}, reason: 'Reintentar con parámetros diferentes' }],
      shouldReplan: this.shouldReplan(stepId)
    };
  }

  getHistory(stepId) {
    return stepId ? this._history.filter(e => e.stepId === stepId) : [...this._history];
  }

  clearHistory(stepId) {
    if (stepId) {
      this._history = this._history.filter(e => e.stepId !== stepId);
    } else {
      this._history = [];
    }
  }
}
