import { store } from '../state/store.js';
import { bus } from '../utils/event-bus.js';

const TASK_KEY = 'tasks';

function _getTasks() {
  const memory = store.get('userMemory') || {};
  return memory[TASK_KEY] || [];
}

function _saveTasks(tasks) {
  const memory = store.get('userMemory');
  if (!memory) return false;
  memory[TASK_KEY] = tasks;
  bus.emit('memory:write-requested', memory);
  return true;
}

export function saveTask(title, category, description, dueDate, priority) {
  const tasks = _getTasks();
  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    title,
    category: category || 'general',
    description: description || '',
    dueDate: dueDate || '',
    priority: priority || 'normal',
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  tasks.push(task);
  return _saveTasks(tasks) ? task : null;
}

export function listTasks(category, status, keyword) {
  let tasks = _getTasks();
  if (category) tasks = tasks.filter(t => t.category.toLowerCase() === category.toLowerCase());
  if (status) tasks = tasks.filter(t => t.status === status);
  if (keyword) {
    const kw = keyword.toLowerCase();
    tasks = tasks.filter(t => t.title.toLowerCase().includes(kw) || t.description.toLowerCase().includes(kw));
  }
  return tasks.reverse();
}

export function completeTask(id) {
  const tasks = _getTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return null;
  task.status = 'completed';
  task.completedAt = new Date().toISOString();
  return _saveTasks(tasks) ? task : null;
}

export function deleteTask(id) {
  const tasks = _getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return false;
  tasks.splice(idx, 1);
  return _saveTasks(tasks);
}

export function getPendingTasksSummary(maxTasks) {
  const tasks = _getTasks().filter(t => t.status === 'pending');
  if (tasks.length === 0) return '';
  const sorted = tasks.slice(-(maxTasks || 15));
  const categories = {};
  for (const t of sorted) {
    const cat = t.category || 'general';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(t);
  }
  const lines = Object.entries(categories).map(([cat, items]) => {
    return `  [${cat.toUpperCase()}] ${items.map(t => `${t.title}${t.dueDate ? ' (para: ' + t.dueDate + ')' : ''}${t.priority === 'high' ? ' ⚠' : ''}`).join(', ')}`;
  });
  return `\nTAREAS PENDIENTES:\n${lines.join('\n')}\nTotal: ${tasks.length} pendientes`;
}
