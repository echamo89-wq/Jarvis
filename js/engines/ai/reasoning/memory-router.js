/**
 * AI Engine — Memory Router Module.
 * Decide el mecanismo óptimo de almacenamiento de memoria (episódica, semántica, working o a largo plazo)
 * según el tipo de información recibida.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('AI-MEM-ROUTER');

export const memoryRouter = {
  /**
   * Enruta la información recibida a la base de memoria correspondiente.
   * @param {string} category - Categoría sugerida
   * @param {string} content - Información o hecho a recordar
   */
  async routeMemory(category, content) {
    const cat = (category || 'general').toLowerCase();
    
    _log.info(`Enrutando memoria de categoría: ${cat}`);

    if (cat === 'preferences' || cat === 'user' || cat === 'nombre') {
      // Largo plazo (preferencias de usuario)
      _log.info('Guardando en memoria de largo plazo.');
      busEmit('memory:long-term', { content });
    } else if (cat === 'hecho' || cat === 'fact' || cat === 'informacion') {
      // Semántica (hechos genéricos)
      _log.info('Guardando en memoria semántica.');
      busEmit('memory:semantic', { content });
    } else {
      // Episódica (qué pasó en la conversación)
      _log.info('Guardando en memoria episódica.');
      busEmit('memory:episodic', { content });
    }
  }
};

function busEmit(event, data) {
  try {
    if (window._jarvisKernel?.bus) {
      window._jarvisKernel.bus.emit(event, data);
    }
  } catch {}
}

export default memoryRouter;
