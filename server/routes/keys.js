const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, requireTier } = require('../middleware/auth');

const router = express.Router();
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no configurado en variables de entorno');
}
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

router.get('/', authenticate, (req, res) => {
  const keys = db.prepare('SELECT id, provider, label, is_active, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ keys });
});

router.post('/', authenticate, (req, res) => {
  const { provider, key, label } = req.body;
  if (!provider || !key) {
    return res.status(400).json({ error: 'Provider y key requeridos' });
  }
  const allowedProviders = ['gemini', 'claude', 'openai', 'groq'];
  if (!allowedProviders.includes(provider)) {
    return res.status(400).json({ error: `Provider inválido. Permitidos: ${allowedProviders.join(', ')}` });
  }
  const user = db.prepare('SELECT tier FROM users WHERE id = ?').get(req.user.id);
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE user_id = ? AND is_active = 1').get(req.user.id).count;
  const maxKeys = user.tier === 'premium' ? 5 : 1;
  if (existingCount >= maxKeys) {
    return res.status(403).json({ error: `Límite de ${maxKeys} key(s) alcanzado para tu plan` });
  }
  const id = uuidv4();
  const encrypted = encrypt(key);
  db.prepare('INSERT INTO api_keys (id, user_id, provider, key_encrypted, label) VALUES (?, ?, ?, ?, ?)').run(id, req.user.id, provider, encrypted, label || '');
  res.status(201).json({ id, provider, label: label || '', is_active: 1 });
});

router.delete('/:id', authenticate, (req, res) => {
  const key = db.prepare('SELECT id, user_id FROM api_keys WHERE id = ?').get(req.params.id);
  if (!key || key.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Key no encontrada' });
  }
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
