/**
 * Memory Engine — Unified Entry Point.
 * Expone las APIs unificadas y los cuatro tipos de memoria cognitiva humana.
 */

import { JsonMemory } from './json-memory.js';
import { initMemorySystem, storeMemory, storeTurn, retrieveRelevant, getMemoryContext, getMemoryStats } from './vector-memory.js';

// Cognitive Submodules
import { episodicMemory } from './episodic/episodic-memory.js';
import { semanticMemory } from './semantic/semantic-memory.js';
import { workingMemory } from './working/working-memory.js';
import { longTermMemory } from './long-term/long-term-memory.js';

export const jsonMemory = new JsonMemory();

export async function initMemoryEngine() {
  await jsonMemory.load();
  await initMemorySystem();
}

export {
  // Legacy APIs
  storeMemory,
  storeTurn,
  retrieveRelevant,
  getMemoryContext,
  getMemoryStats,

  // Cognitive Submodules
  episodicMemory,
  semanticMemory,
  workingMemory,
  longTermMemory
};
