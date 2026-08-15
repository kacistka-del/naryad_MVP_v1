import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { authRequired } from '../middleware.js';
import { httpError } from '../http.js';

const router = express.Router();

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
const maxMb = Number(process.env.MAX_UPLOAD_MB || 10);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 12).replace(/[^A-Za-z0-9.]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: maxMb * 1024 * 1024 } });

const publicApiUrl = () => (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');

// Замена integrations.Core.UploadFile
router.post('/', authRequired, upload.single('file'), (req, res, next) => {
  if (!req.file) return next(httpError(400, 'Файл не передан (поле file)'));
  const relative = `/uploads/${req.file.filename}`;
  res.json({
    file_url: publicApiUrl() ? publicApiUrl() + relative : relative,
    file_name: req.file.originalname,
    size: req.file.size,
    mime_type: req.file.mimetype,
  });
});

export default router;
