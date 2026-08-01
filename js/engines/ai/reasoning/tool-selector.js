/**
 * AI Engine — Tool Selector Module.
 * Analiza la intención del usuario y pre-selecciona el subconjunto de herramientas óptimo
 * para reducir costos de contexto e incrementar precisión.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('AI-TOOL-SELECTOR');

export const toolSelector = {
  /**
   * Filtrar herramientas disponibles según la intención.
   * @param {string} prompt - Consulta del usuario
   * @param {Array<Object>} allTools - Lista completa de declaraciones de herramientas
   * @returns {Array<Object>} Lista filtrada de herramientas recomendadas
   */
  selectTools(prompt, allTools = []) {
    if (!Array.isArray(allTools) || allTools.length === 0) return [];
    
    const query = (prompt || '').toLowerCase().trim();

    // 1. Mapeo simple de keywords a herramientas
    const keywordMap = {
      screenshot: ['take_screenshot', 'analyze_screen'],
      pantalla: ['take_screenshot', 'analyze_screen'],
      ocr: ['analyze_screen'],
      volumen: ['set_volume', 'get_volume'],
      brillo: ['set_brightness', 'get_brightness'],
      ejecuta: ['execute_powershell'],
      powershell: ['execute_powershell'],
      abre: ['launch_app'],
      spotify: ['spotify_play', 'spotify_pause', 'spotify_next', 'spotify_prev'],
      notion: ['notion_create_page', 'notion_append_block'],
      clima: ['get_weather_forecast']
    };

    const recommendedNames = new Set();
    Object.keys(keywordMap).forEach(kw => {
      if (query.includes(kw)) {
        keywordMap[kw].forEach(name => recommendedNames.add(name));
      }
    });

    // 2. Si no hay coincidencias de palabras clave, devolvemos un set base de utilidades genéricas
    if (recommendedNames.size === 0) {
      return allTools.filter(t => 
        t.name === 'take_screenshot' || 
        t.name === 'launch_app' || 
        t.name === 'execute_powershell'
      );
    }

    // 3. Filtrar de la lista completa
    return allTools.filter(t => recommendedNames.has(t.name));
  }
};

export default toolSelector;
