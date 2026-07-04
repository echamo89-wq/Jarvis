const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (err) {
  console.warn('[SERVER] express-rate-limit no instalado. Se omite el rate limiting.');
}
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('\x1b[31m[FATAL] JWT_SECRET no configurado. Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\x1b[0m');
    process.exit(1);
  }
  console.warn('\x1b[33m[WARN] JWT_SECRET no configurado. Generando secreto temporal para desarrollo.\x1b[0m');
  console.warn('\x1b[33m[WARN] NO USAR EN PRODUCCIÓN. Configura JWT_SECRET en .env\x1b[0m');
  process.env.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
}

const { initDatabase, getDb } = require('./db');
const authRoutes = require('./routes/auth');
const keysRoutes = require('./routes/keys');
const proxyRoutes = require('./routes/proxy');
const feedbackRoutes = require('./routes/feedback');

const app = express();
const PORT = process.env.PORT || 3001;

(async () => {
  await initDatabase();
  console.log('[DB] Base de datos lista');
})();

app.use(helmet());

const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'app://.', 'file://'];
app.use(cors({
  origin: CORS_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

if (rateLimit) {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Límite de solicitudes alcanzado.' },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api', apiLimiter);
} else {
  console.warn('[SERVER] No se aplicará rate limiting porque express-rate-limit no está disponible.');
}

app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/feedback', feedbackRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: Date.now() });
});

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const httpServer = require('http').createServer(app);
httpServer.listen(PORT, () => {
  console.log(`[JARVIS SERVER] HTTP corriendo en puerto ${PORT}`);
  console.log(`[JARVIS SERVER] Health: http://localhost:${PORT}/api/health`);
});
