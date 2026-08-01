/**
 * AI Engine — Critic Module.
 * Realiza una auto-evaluación rápida de calidad y seguridad de las respuestas del modelo.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('AI-CRITIC');

export const critic = {
  /**
   * Evalúa si una respuesta es aceptable para presentarse al usuario.
   * @param {string} responseText - Respuesta generada por el LLM
   * @returns {Promise<{approved:boolean, score:number, feedback?:string}>}
   */
  async evaluate(responseText) {
    if (!responseText || responseText.trim().length === 0) {
      return { approved: false, score: 0, feedback: 'Respuesta vacía.' };
    }

    // Reglas básicas de validación offline
    const checks = {
      noSystemPromptsLeaked: !responseText.includes('system_instruction') && !responseText.includes('blocked-patterns'),
      noStubsFound: !responseText.includes('[placeholder]') && !responseText.includes('TODO:'),
      acceptableLength: responseText.length > 2
    };

    const passedCount = Object.values(checks).filter(Boolean).length;
    const score = (passedCount / Object.keys(checks).length) * 100;

    _log.info(`Evaluación de calidad completada. Puntuación: ${score}/100`);

    return {
      approved: score >= 100,
      score,
      feedback: score < 100 ? 'La respuesta filtró instrucciones del sistema o contiene placeholders.' : null
    };
  }
};

export default critic;
