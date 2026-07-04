const express = require('express');
const { authenticate, requireTier } = require('../middleware/auth');
const { db } = require('../db');

const router = express.Router();

const DAILY_MESSAGE_LIMIT = { free: 50, premium: 999999 };

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function checkUsageLimit(userId, tier) {
  const today = getToday();
  const record = db.prepare('SELECT messages_count FROM usage_records WHERE user_id = ? AND date = ?').get(userId, today);
  const used = record ? record.messages_count : 0;
  const limit = DAILY_MESSAGE_LIMIT[tier] || 50;
  return { used, limit, ok: used < limit };
}

function incrementUsage(userId, provider, audioSec = 0, tools = 0) {
  const today = getToday();
  const existing = db.prepare('SELECT id FROM usage_records WHERE user_id = ? AND date = ?').get(userId, today);
  if (existing) {
    db.prepare('UPDATE usage_records SET messages_count = messages_count + 1, audio_seconds = audio_seconds + ?, tools_used = tools_used + ? WHERE id = ?').run(audioSec, tools, existing.id);
  } else {
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT INTO usage_records (id, user_id, date, provider, messages_count, audio_seconds, tools_used) VALUES (?, ?, ?, ?, 1, ?, ?)').run(uuidv4(), userId, today, provider, audioSec, tools);
  }
}

// Proxy Gemini REST (no-WebSocket, solo chat)
router.post('/gemini/chat', authenticate, (req, res) => {
  const user = db.prepare('SELECT tier FROM users WHERE id = ?').get(req.user.id);
  const { used, limit, ok } = checkUsageLimit(req.user.id, user.tier);
  if (!ok) {
    return res.status(429).json({ error: `Límite diario de ${limit} mensajes alcanzado. Cambia a Premium o espera al próximo día.` });
  }
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array requerido' });
  }
  const serverKey = process.env.SERVER_API_KEY;
  if (!serverKey) {
    return res.status(500).json({ error: 'API key del servidor no configurada' });
  }
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${serverKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: messages })
  })
  .then(r => r.json())
  .then(data => {
    incrementUsage(req.user.id, 'gemini');
    res.json(data);
  })
  .catch(e => {
    res.status(502).json({ error: `Error del proxy: ${e.message}` });
  });
});

// Universal chat proxy — soporta Gemini, Claude, OpenAI, Groq
router.post('/chat', async (req, res) => {
  try {
    const { provider, message } = req.body;
    if (!provider || !message) {
      return res.status(400).json({ error: 'Provider y message requeridos' });
    }
    const PROVIDER_KEYS = {
      gemini: { env: 'GEMINI_API_KEY', url: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        body: (msg) => ({ contents: [{ parts: [{ text: msg }] }] }),
        parse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || '' },
      claude: { env: 'ANTHROPIC_API_KEY', url: () => 'https://api.anthropic.com/v1/messages',
        body: (msg) => ({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, messages: [{ role: 'user', content: msg }] }),
        parse: (data) => data?.content?.[0]?.text || '',
        headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }) },
      openai: { env: 'OPENAI_API_KEY', url: () => 'https://api.openai.com/v1/chat/completions',
        body: (msg) => ({ model: 'gpt-4o', messages: [{ role: 'user', content: msg }] }),
        parse: (data) => data?.choices?.[0]?.message?.content || '',
        headers: (key) => ({ 'Authorization': `Bearer ${key}` }) },
      groq: { env: 'GROQ_API_KEY', url: () => 'https://api.groq.com/openai/v1/chat/completions',
        body: (msg) => ({ model: 'mixtral-8x7b-32768', messages: [{ role: 'user', content: msg }] }),
        parse: (data) => data?.choices?.[0]?.message?.content || '',
        headers: (key) => ({ 'Authorization': `Bearer ${key}` }) },
    };
    const config = PROVIDER_KEYS[provider];
    if (!config) return res.status(400).json({ error: `Proveedor no soportado: ${provider}` });
    const apiKey = process.env[config.env] || db.prepare('SELECT key_encrypted FROM api_keys WHERE provider = ? AND is_active = 1').get(provider)?.key_encrypted;
    if (!apiKey) {
      return res.status(400).json({ error: `API key para ${provider} no encontrada. Configúrala en el servidor o desde la app.` });
    }
    const headers = { 'Content-Type': 'application/json', ...(config.headers ? config.headers(apiKey) : {}) };
    // Gemini usa key en URL
    const fetchUrl = config.env === 'GEMINI_API_KEY' ? config.url(apiKey) : config.url();
    const resp = await fetch(fetchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(config.body(message)),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(502).json({ error: `Error de ${provider}: ${data?.error?.message || JSON.stringify(data)}` });
    }
    const response = config.parse(data);
    res.json({ response, provider });
  } catch (e) {
    res.status(500).json({ error: `Error del proxy: ${e.message}` });
  }
});

router.get('/usage', authenticate, (req, res) => {
  const user = db.prepare('SELECT tier FROM users WHERE id = ?').get(req.user.id);
  const { used, limit } = checkUsageLimit(req.user.id, user.tier);
  res.json({ used, limit, tier: user.tier, date: getToday() });
});

module.exports = router;
