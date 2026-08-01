/**
 * facts.js — Sistema de memoria de hechos del usuario v2
 *
 * Características:
 * - Deduplicación automática por similitud de texto
 * - Niveles de importancia: critical, high, normal, low
 * - Categorías enriquecidas y límites por nivel
 * - Actualización de hechos existentes (upsert inteligente)
 * - Búsqueda eficiente con múltiples filtros
 * - Estadísticas de memoria
 */

import { store } from '../state/store.js';
import { bus } from '../utils/event-bus.js';

const FACT_KEY = 'userFacts';

// Límites por nivel de importancia (cuántos hechos de cada nivel se mantienen)
const LIMITS = {
  critical: 50,   // Datos de identidad, condiciones médicas, miedos profundos
  high:     100,  // Preferencias fuertes, proyectos activos, metas
  normal:   200,  // Hábitos, gustos, comportamientos
  low:      100,  // Detalles menores, curiosidades
};

const TOTAL_LIMIT = 450;

// Categorías válidas con display name
export const CATEGORIES = {
  // Identidad
  identidad:     'Identidad',
  nombre:        'Nombre',
  edad:          'Edad',
  ubicacion:     'Ubicación',
  profesion:     'Profesión',
  idioma:        'Idioma',
  // Preferencias
  preferencia:   'Preferencia',
  gusto:         'Gusto',
  disgusto:      'Disgusto',
  comida:        'Comida',
  musica:        'Música',
  entretenimiento: 'Entretenimiento',
  // Proyectos y trabajo
  proyecto:      'Proyecto',
  trabajo:       'Trabajo',
  meta:          'Meta',
  tecnologia:    'Tecnología',
  programacion:  'Programación',
  // Comportamiento y rutinas
  rutina:        'Rutina',
  habito:        'Hábito',
  horario:       'Horario',
  // Relaciones
  familia:       'Familia',
  amigo:         'Amigo',
  mascota:       'Mascota',
  // Contexto y estado
  estado:        'Estado',
  salud:         'Salud',
  finanzas:      'Finanzas',
  // Conocimiento
  habilidad:     'Habilidad',
  conocimiento:  'Conocimiento',
  aprendizaje:   'Aprendizaje',
  // General
  general:       'General',
};

function _getMemory() {
  return store.get('userMemory');
}

function _getFacts() {
  const m = _getMemory() || {};
  if (!m[FACT_KEY]) m[FACT_KEY] = [];
  return m[FACT_KEY];
}

function _persist() {
  const memory = _getMemory();
  if (memory) bus.emit('memory:write-requested', memory);
}

function _id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Similitud simple por palabras clave (sin embeddings para ser rápido) ──────
function _similarity(a, b) {
  if (!a || !b) return 0;
  const normalize = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2);

  const wa = new Set(normalize(a));
  const wb = new Set(normalize(b));
  if (wa.size === 0 || wb.size === 0) return 0;

  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

// ── Detectar duplicado: si hay similitud >0.8 con la misma categoría ──────────
function _findDuplicate(facts, category, factText) {
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    if (f.category !== category) continue;
    const sim = _similarity(f.fact, factText);
    if (sim >= 0.75) return i;
  }
  return -1;
}

// ── Aplicar límites por importancia ──────────────────────────────────────────
function _applyLimits(facts) {
  const byLevel = { critical: [], high: [], normal: [], low: [] };
  for (const f of facts) {
    const lvl = byLevel[f.importance] ? f.importance : 'normal';
    byLevel[lvl].push(f);
  }
  // Ordenar cada grupo: más recientes primero, pero conservar los más importantes
  // Los "critical" y "high" no se tocan (ya tienen límites altos)
  const result = [];
  for (const [level, limit] of Object.entries(LIMITS)) {
    const group = byLevel[level] || [];
    // Conservar los más recientes dentro del límite
    const kept = group.slice(-limit);
    result.push(...kept);
  }
  // Cap total
  return result.slice(-TOTAL_LIMIT);
}

// ══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════════════════════

export function getAllFacts() {
  return _getFacts();
}

/**
 * Guarda un hecho. Si ya existe uno muy similar en la misma categoría, lo actualiza.
 * @param {string} category
 * @param {string} fact
 * @param {'critical'|'high'|'normal'|'low'} importance
 * @returns {{ saved: boolean, updated: boolean, duplicate: boolean }}
 */
export function saveFact(category, fact, importance = 'normal') {
  const memory = _getMemory();
  if (!memory) return { saved: false, updated: false, duplicate: false };

  if (!memory[FACT_KEY]) memory[FACT_KEY] = [];
  const facts = memory[FACT_KEY];

  const cat = (category || 'general').toLowerCase().trim();
  const imp = ['critical', 'high', 'normal', 'low'].includes(importance) ? importance : 'normal';
  const factText = (fact || '').trim();
  if (!factText) return { saved: false, updated: false, duplicate: false };

  // Buscar duplicado
  const dupIdx = _findDuplicate(facts, cat, factText);

  if (dupIdx >= 0) {
    const existing = facts[dupIdx];
    // Si el nuevo texto es más largo o tiene mayor importancia, actualiza
    const importanceOrder = { critical: 3, high: 2, normal: 1, low: 0 };
    const shouldUpdate =
      factText.length > existing.fact.length ||
      importanceOrder[imp] > importanceOrder[existing.importance || 'normal'];

    if (shouldUpdate) {
      facts[dupIdx] = {
        ...existing,
        fact: factText,
        importance: importanceOrder[imp] >= importanceOrder[existing.importance || 'normal'] ? imp : existing.importance,
        updatedAt: new Date().toISOString(),
      };
      memory[FACT_KEY] = _applyLimits(facts);
      _persist();
      return { saved: true, updated: true, duplicate: false };
    }
    // Duplicado exacto sin mejora — no guardar
    return { saved: false, updated: false, duplicate: true };
  }

  // Nuevo hecho
  facts.push({
    id: _id(),
    category: cat,
    fact: factText,
    importance: imp,
    date: new Date().toISOString(),
    updatedAt: null,
  });

  memory[FACT_KEY] = _applyLimits(facts);
  _persist();
  return { saved: true, updated: false, duplicate: false };
}

/**
 * Busca hechos con filtros opcionales.
 * @param {string} [category]
 * @param {string} [keyword]
 * @param {number} [limit]
 * @param {'critical'|'high'|'normal'|'low'} [minImportance]
 */
export function recallFacts(category, keyword, limit = 20, minImportance = null) {
  let facts = _getFacts();
  const importanceOrder = { critical: 3, high: 2, normal: 1, low: 0 };
  const minOrder = minImportance ? (importanceOrder[minImportance] ?? 0) : 0;

  if (category) {
    const catLower = category.toLowerCase();
    facts = facts.filter(f => f.category === catLower || f.category.startsWith(catLower));
  }
  if (keyword) {
    const kw = keyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    facts = facts.filter(f => {
      const text = (f.fact || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cat = (f.category || '').toLowerCase();
      return text.includes(kw) || cat.includes(kw);
    });
  }
  if (minImportance) {
    facts = facts.filter(f => (importanceOrder[f.importance] ?? 1) >= minOrder);
  }

  // Ordenar: primero por importancia, luego por fecha más reciente
  facts.sort((a, b) => {
    const ia = importanceOrder[a.importance] ?? 1;
    const ib = importanceOrder[b.importance] ?? 1;
    if (ia !== ib) return ib - ia;
    return (b.updatedAt || b.date || '').localeCompare(a.updatedAt || a.date || '');
  });

  return facts.slice(0, limit);
}

export function deleteFact(id) {
  const memory = _getMemory();
  if (!memory || !memory[FACT_KEY]) return false;
  const before = memory[FACT_KEY].length;
  memory[FACT_KEY] = memory[FACT_KEY].filter(f => f.id !== id);
  if (memory[FACT_KEY].length < before) {
    _persist();
    return true;
  }
  return false;
}

export function deleteFactsByCategory(category) {
  const memory = _getMemory();
  if (!memory || !memory[FACT_KEY]) return 0;
  const cat = (category || '').toLowerCase();
  const before = memory[FACT_KEY].length;
  memory[FACT_KEY] = memory[FACT_KEY].filter(f => f.category !== cat);
  const removed = before - memory[FACT_KEY].length;
  if (removed > 0) _persist();
  return removed;
}

export function getMemoryStats() {
  const facts = _getFacts();
  const byCategory = {};
  const byImportance = { critical: 0, high: 0, normal: 0, low: 0 };

  for (const f of facts) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    if (byImportance[f.importance] !== undefined) byImportance[f.importance]++;
    else byImportance.normal++;
  }

  return {
    total: facts.length,
    limit: TOTAL_LIMIT,
    byCategory,
    byImportance,
    categories: Object.keys(byCategory).sort(),
  };
}

/**
 * Formatea los hechos más importantes para incluir en el system prompt.
 * Prioriza critical y high, incluye el resto hasta maxFacts.
 */
export function getFormattedFactsForPrompt(maxFacts = 25) {
  const facts = _getFacts();
  if (!facts.length) return '';

  const importanceOrder = { critical: 3, high: 2, normal: 1, low: 0 };
  const sorted = [...facts].sort((a, b) => {
    const ia = importanceOrder[a.importance] ?? 1;
    const ib = importanceOrder[b.importance] ?? 1;
    if (ia !== ib) return ib - ia;
    return (b.updatedAt || b.date || '').localeCompare(a.updatedAt || a.date || '');
  });

  return sorted.slice(0, maxFacts).map(f => {
    const imp = f.importance === 'critical' ? '⭐' : f.importance === 'high' ? '▲' : '';
    return `${imp}[${f.category}] ${f.fact}`;
  }).join('\n');
}
