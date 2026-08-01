const STORE_KEY = 'jarvis_vector_memory';

let _entries = [];
let _loaded = false;

function _uuid() {
  return 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function _cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function _serialize(entries) {
  return entries.map(e => ({
    ...e,
    embedding: Array.from(e.embedding)
  }));
}

function _deserialize(entries) {
  return entries.map(e => ({
    ...e,
    embedding: Float32Array.from(e.embedding)
  }));
}

async function _loadFromDisk() {
  try {
    const raw = await window.electronAPI?.memoryVectorsRead();
    if (raw && Array.isArray(raw.entries)) {
      _entries = _deserialize(raw.entries);
    }
  } catch {}
  _loaded = true;
}

async function _saveToDisk() {
  try {
    await window.electronAPI?.memoryVectorsWrite({ entries: _serialize(_entries) });
  } catch {}
}

export async function initVectorStore() {
  await _loadFromDisk();
}

export function getEntryCount() {
  return _entries.length;
}

export async function addEntry({ text, embedding, type = 'conversation', source = 'system', metadata = {} }) {
  const entry = {
    id: _uuid(),
    text,
    embedding,
    timestamp: Date.now(),
    type,
    source,
    metadata
  };
  _entries.push(entry);
  if (_entries.length > 1000) {
    _entries.shift();
  }
  await _saveToDisk();
  return entry.id;
}

export async function deleteEntry(id) {
  _entries = _entries.filter(e => e.id !== id);
  await _saveToDisk();
}

export async function clearAll() {
  _entries = [];
  await _saveToDisk();
}

export function search(queryEmbedding, k = 5, minScore = 0) {
  const scored = _entries.map(e => ({
    entry: e,
    score: _cosineSimilarity(queryEmbedding, e.embedding)
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter(s => s.score >= minScore)
    .slice(0, k)
    .map(s => ({ text: s.entry.text, type: s.entry.type, source: s.entry.source, metadata: s.entry.metadata, timestamp: s.entry.timestamp, score: s.score }));
}

export function getAllEntries() {
  return _entries.map(e => ({
    id: e.id,
    text: e.text,
    type: e.type,
    source: e.source,
    timestamp: e.timestamp,
    metadata: e.metadata,
    embeddingLength: e.embedding.length
  }));
}
