import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { loadUser } from './middleware.js';
import { wrap } from './http.js';
import { query } from './db.js';
import authRoutes from './routes/auth.js';
import entityRoutes from './routes/entities.js';
import functionRoutes from './routes/functions.js';
import uploadRoutes from './routes/uploads.js';
import llmRoutes from './routes/llm.js';

const app = express();
const PORT = Number(process.env.PORT || 8080);

app.set('trust proxy', 1);
app.disable('x-powered-by');

const origins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '2mb' }));

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '30d', fallthrough: true }));

app.use(loadUser);

app.get(
  '/api/health',
  wrap(async (_req, res) => {
    await query('select 1');
    res.json({ ok: true, service: 'naryad-api', time: new Date().toISOString() });
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/llm', llmRoutes);

app.use((req, res) => res.status(404).json({ error: `Маршрут не найден: ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] NARYAD backend слушает порт ${PORT}`);
});
