/**
 * Voice Engine — Conversation Turn Manager.
 * Controla el flujo de los turnos de conversación, temporizadores de habla y respuesta.
 */

import { kernel } from '../../../kernel/index.js';

const _log = kernel.logger.create('VOICE-TURN');

let _turnTimer = null;

export const turnManager = {
  init() {
    // Escuchar el bus de eventos
    kernel.bus.on('voice:listening', () => {
      this.startTurn();
    });

    kernel.bus.on('voice:silence', () => {
      this.endTurn();
    });
  },

  startTurn() {
    if (_turnTimer) {
      clearTimeout(_turnTimer);
      _turnTimer = null;
    }
    _log.info('Turno iniciado: Usuario hablando.');
    kernel.state.setState('listening');
  },

  endTurn() {
    _log.info('Turno detectado completo: Procesando respuesta...');
    kernel.state.setState('working');
    // Aquí el planificador o el AI Engine toma el control para responder
  }
};

export default turnManager;
