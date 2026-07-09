import { store } from '../state/store.js';
import { bus } from '../utils/event-bus.js';

const FACT_STORE_KEY = 'userFacts';

export function getAllFacts() {
  const memory = store.get('userMemory') || {};
  return memory[FACT_STORE_KEY] || [];
}

export function saveFact(category, fact, importance) {
  const memory = store.get('userMemory');
  if (!memory) return false;
  if (!memory[FACT_STORE_KEY]) memory[FACT_STORE_KEY] = [];
  memory[FACT_STORE_KEY].push({
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    category: category || 'general',
    fact,
    importance: importance || 'normal',
    date: new Date().toISOString()
  });
  bus.emit('memory:write-requested', memory);
  return true;
}

export function recallFacts(category, keyword, limit) {
  const facts = getAllFacts();
  let filtered = facts;
  if (category) {
    filtered = filtered.filter(f => f.category.toLowerCase() === category.toLowerCase());
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    filtered = filtered.filter(f => f.fact.toLowerCase().includes(kw));
  }
  return filtered.slice(-(limit || 10));
}

export function deleteFact(id) {
  const memory = store.get('userMemory');
  if (!memory || !memory[FACT_STORE_KEY]) return false;
  memory[FACT_STORE_KEY] = memory[FACT_STORE_KEY].filter(f => f.id !== id);
  bus.emit('memory:write-requested', memory);
  return true;
}

export function getFormattedFactsForPrompt(maxFacts) {
  const facts = getAllFacts();
  if (facts.length === 0) return '';
  const sorted = facts.slice(-(maxFacts || 20));
  return sorted.map(f => `[${f.category}] ${f.fact}`).join('\n');
}
