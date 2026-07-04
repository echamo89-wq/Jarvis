const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Store uploads in a temp dir inside server/
const UPLOAD_DIR = path.join(__dirname, '..', 'feedback_uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    cb(null, `${ts}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

/**
 * POST /api/feedback
 * Accepts multipart form-data with:
 *   - message (string)
 *   - version (string)
 *   - user (string)
 *   - timestamp (ISO string)
 *   - attachment? (file, optional)
 *
 * Saves a JSON log to feedback_uploads/ and optionally forwards to a
 * developer webhook if FEEDBACK_WEBHOOK_URL is set in the environment.
 */
router.post('/', upload.single('attachment'), async (req, res) => {
  try {
    const { message, version, user, timestamp } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El campo message es obligatorio.' });
    }

    const record = {
      id: Date.now().toString(36),
      timestamp: timestamp || new Date().toISOString(),
      version: version || 'unknown',
      user: user || 'anon',
      message: message.trim(),
      attachment: req.file ? req.file.filename : null
    };

    // Write JSON log
    const logFile = path.join(UPLOAD_DIR, `${record.id}.json`);
    fs.writeFileSync(logFile, JSON.stringify(record, null, 2), 'utf-8');

    // Optional: forward to developer webhook (Discord/Slack/custom)
    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        // Simple JSON payload — attachment not forwarded to webhook (stored locally)
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `**[JARVIS ${record.version} Feedback]** de \`${record.user}\`\n>>> ${record.message}` +
              (record.attachment ? `\n📎 Adjunto: \`${record.attachment}\`` : '')
          }),
          signal: AbortSignal.timeout(5000)
        });
      } catch (webhookErr) {
        console.warn('[FEEDBACK] Webhook forward failed:', webhookErr.message);
      }
    }

    console.log(`[FEEDBACK] Reporte guardado: ${record.id} — ${record.user}`);
    res.json({ ok: true, id: record.id });
  } catch (err) {
    console.error('[FEEDBACK] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/feedback (developer listing — protected by a simple token)
 */
router.get('/', (req, res) => {
  const devToken = process.env.FEEDBACK_DEV_TOKEN;
  if (devToken && req.query.token !== devToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.json'));
  const reports = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(UPLOAD_DIR, f), 'utf-8')); }
    catch { return null; }
  }).filter(Boolean);
  reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ reports });
});

module.exports = router;
