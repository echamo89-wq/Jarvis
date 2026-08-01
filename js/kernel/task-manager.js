/**
 * Task Manager Central del Kernel de JARVIS.
 * Gestiona ejecuciones largas en segundo plano, colas con prioridades, progreso, reintentos y cancelación limpia.
 */

import { bus } from './event-bus.js';
import { createLogger } from './logger.js';

const _log = createLogger('TASKS');

const PRIORITIES = {
  CRITICAL: 3,
  HIGH: 2,
  NORMAL: 1,
  LOW: 0
};

const _tasks = new Map(); // taskId -> taskObject
let _taskIdCounter = 0;
const MAX_CONCURRENCY = 3;
let _runningCount = 0;

export const taskManager = {
  /**
   * Registrar y ejecutar una tarea.
   * @param {Object} spec - Configuración de la tarea
   * @param {string} spec.name - Nombre identificador
   * @param {string} spec.priority - 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'
   * @param {Function} spec.fn - Función ejecutable: async (signal, onProgress) => result
   * @param {number} spec.retries - Número de reintentos en fallo (default 0)
   * @returns {string} ID de la tarea
   */
  run(spec) {
    const priorityName = (spec.priority || 'NORMAL').toUpperCase();
    const priority = PRIORITIES[priorityName] !== undefined ? PRIORITIES[priorityName] : PRIORITIES.NORMAL;
    const taskId = `task-${++_taskIdCounter}`;
    const controller = new AbortController();

    const taskObj = {
      id: taskId,
      name: spec.name,
      priority,
      priorityName,
      status: 'pending', // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
      progress: 0,
      fn: spec.fn,
      retriesLeft: spec.retries || 0,
      maxRetries: spec.retries || 0,
      controller,
      error: null,
      result: null,
      submittedAt: Date.now(),
      startedAt: null,
      endedAt: null
    };

    _tasks.set(taskId, taskObj);
    _log.info(`Tarea "${spec.name}" añadida a la cola con prioridad ${priorityName} (ID: ${taskId})`);
    
    bus.emit('task:added', { taskId, name: spec.name });
    
    // Programar ejecución
    setTimeout(() => this._schedule(), 0);

    return taskId;
  },

  /**
   * Cancelar una tarea activa o pendiente.
   */
  cancel(taskId) {
    const task = _tasks.get(taskId);
    if (!task) return;

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return;
    }

    task.status = 'cancelled';
    task.endedAt = Date.now();
    task.controller.abort();
    
    _log.warn(`Tarea "${task.name}" (ID: ${taskId}) cancelada por el usuario.`);
    bus.emit('task:cancelled', { taskId, name: task.name });

    if (task.startedAt) {
      _runningCount--;
    }

    setTimeout(() => this._schedule(), 0);
  },

  /**
   * Consultar estado de una tarea.
   */
  getTask(taskId) {
    return _tasks.get(taskId);
  },

  /**
   * Listar todas las tareas.
   */
  listTasks() {
    return Array.from(_tasks.values());
  },

  /**
   * Limpiar historial de tareas completadas/fallidas.
   */
  clearHistory() {
    for (const [id, task] of _tasks.entries()) {
      if (task.status !== 'pending' && task.status !== 'running') {
        _tasks.delete(id);
      }
    }
  },

  // ─── Internos ─────────────────────────────────────────────────────────────────

  _schedule() {
    if (_runningCount >= MAX_CONCURRENCY) return;

    // Buscar la tarea con mayor prioridad pendiente
    const pending = Array.from(_tasks.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority; // Mayor prioridad primero
        }
        return a.submittedAt - b.submittedAt; // Primero en llegar primero en ejecutarse
      });

    if (pending.length === 0) return;

    const task = pending[0];
    task.status = 'running';
    task.startedAt = Date.now();
    _runningCount++;

    _log.info(`Iniciando tarea "${task.name}" (ID: ${task.id})`);
    bus.emit('task:started', { taskId: task.id, name: task.name });

    const onProgress = (pct) => {
      if (task.status !== 'running') return;
      const progress = Math.min(100, Math.max(0, Math.round(pct)));
      task.progress = progress;
      bus.emit('task:progress', { taskId: task.id, name: task.name, progress });
    };

    task.fn(task.controller.signal, onProgress)
      .then(result => {
        if (task.status !== 'running') return; // Cancelada mientras corría
        task.status = 'completed';
        task.result = result;
        task.endedAt = Date.now();
        _runningCount--;
        
        _log.info(`Tarea "${task.name}" terminada con éxito (ID: ${task.id})`);
        bus.emit('task:completed', { taskId: task.id, name: task.name, result });
        
        this._schedule();
      })
      .catch(err => {
        if (task.status !== 'running') return; // Cancelada
        
        if (task.retriesLeft > 0) {
          task.retriesLeft--;
          task.status = 'pending'; // Regresa a la cola
          _runningCount--;
          _log.warn(`Tarea "${task.name}" falló. Reintentando (${task.maxRetries - task.retriesLeft}/${task.maxRetries}) en breve... Error: ${err.message}`);
          
          setTimeout(() => this._schedule(), 1000);
        } else {
          task.status = 'failed';
          task.error = err.message;
          task.endedAt = Date.now();
          _runningCount--;
          
          _log.error(`Tarea "${task.name}" falló definitivamente (ID: ${task.id}). Error: ${err.message}`);
          bus.emit('task:failed', { taskId: task.id, name: task.name, error: err.message });
          
          this._schedule();
        }
      });
  }
};

export default taskManager;
