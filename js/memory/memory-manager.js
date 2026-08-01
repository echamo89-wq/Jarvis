import { generateEmbedding } from './embeddings.js';
import { initVectorStore, addEntry, search, getEntryCount } from './vector-store.js';

let _initialized = false;

export async function initMemorySystem() {
  if (_initialized) return;
  await initVectorStore();
  _initialized = true;
}

export async function storeMemory(text, type = 'conversation', source = 'jarvis', metadata = {}) {
  if (!text || !text.trim()) return;
  try {
    const embedding = await generateEmbedding(text);
    await addEntry({ text, embedding, type, source, metadata });
  } catch (err) {
    console.warn('[MEMORY] store error:', err.message);
  }
}

export async function storeTurn(userMessage, jarvisResponse) {
  if (userMessage?.trim()) {
    await storeMemory(userMessage, 'conversation', 'user', { turnType: 'user_message' });
  }
  if (jarvisResponse?.trim()) {
    await storeMemory(jarvisResponse, 'conversation', 'jarvis', { turnType: 'jarvis_response' });
  }
}

export async function retrieveRelevant(query, k = 5) {
  if (!query || !query.trim()) return [];
  try {
    const queryEmbedding = await generateEmbedding(query);
    return search(queryEmbedding, k);
  } catch (err) {
    console.warn('[MEMORY] retrieve error:', err.message);
    return [];
  }
}

export async function getMemoryContext(query, k = 5) {
  const results = await retrieveRelevant(query, k);
  if (!results.length) return '';
  const lines = results.map((r, i) =>
    `[${r.source}][${r.type}] ${r.text}`
  );
  return `\n=== MEMORIA RELEVANTE ===\n${lines.join('\n')}\n=== FIN MEMORIA ===`;
}

export function getMemoryStats() {
  return { totalEntries: getEntryCount(), initialized: _initialized };
}
