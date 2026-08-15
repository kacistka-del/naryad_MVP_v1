import { query } from './db.js';
import { verifyToken } from './jwt.js';
import { publicUser } from './store.js';
import { httpError } from './http.js';

function bearer(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export async function loadUser(req, _res, next) {
  const token = bearer(req);
  req.user = null;
  if (token) {
    const payload = verifyToken(token);
    if (payload?.sub) {
      const { rows } = await query('select * from users where id = $1', [payload.sub]);
      if (rows[0] && !rows[0].is_blocked) req.user = publicUser(rows[0]);
    }
  }
  next();
}

export function authRequired(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Требуется вход'));
  next();
}

export function adminRequired(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Требуется вход'));
  if (req.user.role !== 'admin') return next(httpError(403, 'Доступно только администратору'));
  next();
}

export const isAdmin = (user) => user?.role === 'admin';
