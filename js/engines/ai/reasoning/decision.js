/**
 * AI Engine — Decision Tree Module.
 * Árbol de decisiones para rutear intenciones de usuario a motores correspondientes (automatización, búsqueda, respuesta simple).
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('AI-DECISION');

export const decisionEngine = {
  /**
   * Analiza una intención y decide el mejor curso de acción.
   * @param {string} prompt - Entrada del usuario
   * @returns {Promise<{route:string, confidence:number}>}
   */
  async routeIntent(prompt) {
    const query = (prompt || '').toLowerCase().trim();
    
    // Reglas de decisión rápidas offline
    if (query.includes('abre') || query.includes('ejecuta') || query.includes('lanza')) {
      return { route: 'automation', confidence: 0.9 };
    }
    
    if (query.includes('clima') || query.includes('tiempo') || query.includes('temperatura')) {
      return { route: 'integration:weather', confidence: 0.95 };
    }

    if (query.includes('canción') || query.includes('reproduce') || query.includes('spotify')) {
      return { route: 'integration:spotify', confidence: 0.9 };
    }

    if (query.includes('pantalla') || query.includes('ves en') || query.includes('mira mi')) {
      return { route: 'vision', confidence: 0.95 };
    }

    // Default: procesar vía modelo LLM cognitivo general
    return { route: 'llm', confidence: 0.8 };
  }
};

export default decisionEngine;
