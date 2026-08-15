import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { publicUser, store } from '../store.js';
import { signToken } from '../jwt.js';
import { authRequired } from '../middleware.js';
import { httpError, wrap } from '../http.js';
import { sendMail, mailConfigured } from '../mailer.js';

const router = express.Router();

const isDev = process.env.NODE_ENV !== 'production';
const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';
const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

const normEmail = (email) => String(email || '').trim().toLowerCase();
const makeOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const minutesFromNow = (m) => new Date(Date.now() + m * 60_000);

async function findByEmail(email) {
  const { rows } = await query('select * from users where email = $1', [normEmail(email)]);
  return rows[0] || null;
}

router.post(
  '/register',
  wrap(async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) throw httpError(400, 'email и password обязательны');
    if (password.length < 8) throw httpError(400, 'Пароль должен быть не короче 8 символов');

    const existing = await findByEmail(email);
    if (existing?.password_hash) throw httpError(409, 'Пользователь с таким email уже существует');

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = makeOtp();
    const profile = { full_name: req.body?.full_name || req.body?.fullName || '' };

    const { rows } = await query(
      `insert into users (email, password_hash, is_verified, otp_code, otp_expires, data)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (email) do update set
         password_hash = excluded.password_hash,
         otp_code = excluded.otp_code,
         otp_expires = excluded.otp_expires,
         updated_date = now()
       returning *`,
      [email, passwordHash, !requireVerification, requireVerification ? otp : null, requireVerification ? minutesFromNow(30) : null, JSON.stringify(profile)]
    );
    const user = rows[0];

    if (!requireVerification) {
      return res.json({ ok: true, access_token: signToken(user), user: publicUser(user) });
    }

    await sendMail({
      to: email,
      subject: 'Код подтверждения NARYAD',
      text: `Ваш код подтверждения: ${otp}\nКод действует 30 минут.`,
    });

    res.json({
      ok: true,
      requiresVerification: true,
      ...(mailConfigured() ? {} : { devOtp: otp }),
    });
  })
);

router.post(
  '/verify-otp',
  wrap(async (req, res) => {
    const email = normEmail(req.body?.email);
    const code = String(req.body?.otpCode || req.body?.code || '').trim();
    if (!email || !code) throw httpError(400, 'email и otpCode обязательны');

    const user = await findByEmail(email);
    if (!user) throw httpError(404, 'Пользователь не найден');
    if (user.is_verified) return res.json({ ok: true, access_token: signToken(user), user: publicUser(user) });
    if (!user.otp_code || user.otp_code !== code) throw httpError(400, 'Неверный код подтверждения');
    if (user.otp_expires && new Date(user.otp_expires) < new Date()) throw httpError(400, 'Код истёк, запросите новый');

    const { rows } = await query(
      'update users set is_verified = true, otp_code = null, otp_expires = null, updated_date = now() where id = $1 returning *',
      [user.id]
    );
    res.json({ ok: true, access_token: signToken(rows[0]), user: publicUser(rows[0]) });
  })
);

router.post(
  '/resend-otp',
  wrap(async (req, res) => {
    const email = normEmail(req.body?.email);
    const user = await findByEmail(email);
    if (!user) throw httpError(404, 'Пользователь не найден');
    if (user.is_verified) return res.json({ ok: true, alreadyVerified: true });

    const otp = makeOtp();
    await query('update users set otp_code = $2, otp_expires = $3, updated_date = now() where id = $1', [
      user.id,
      otp,
      minutesFromNow(30),
    ]);
    await sendMail({ to: email, subject: 'Новый код подтверждения NARYAD', text: `Ваш код: ${otp}` });
    res.json({ ok: true, ...(mailConfigured() ? {} : { devOtp: otp }) });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const user = await findByEmail(email);
    if (!user || !user.password_hash) throw httpError(401, 'Неверный email или пароль');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw httpError(401, 'Неверный email или пароль');
    if (user.is_blocked) throw httpError(403, 'Аккаунт заблокирован');
    if (requireVerification && !user.is_verified) throw httpError(403, 'Email не подтверждён');

    res.json({ ok: true, access_token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', authRequired, (req, res) => res.json(req.user));

router.patch(
  '/me',
  authRequired,
  wrap(async (req, res) => {
    const patch = { ...(req.body || {}) };
    if (req.user.role !== 'admin') {
      delete patch.role;
      delete patch.is_blocked;
    }
    const updated = await store.updateUser(req.user.id, patch);
    res.json(updated);
  })
);

router.post('/logout', (_req, res) => res.json({ ok: true }));

router.post(
  '/forgot-password',
  wrap(async (req, res) => {
    const email = normEmail(req.body?.email);
    const user = await findByEmail(email);
    // Не раскрываем существование аккаунта
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    await query('update users set reset_token = $2, reset_token_expires = $3, updated_date = now() where id = $1', [
      user.id,
      token,
      minutesFromNow(60),
    ]);
    const link = `${appBaseUrl}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Сброс пароля NARYAD',
      text: `Для сброса пароля перейдите по ссылке (действует 1 час):\n${link}`,
    });
    res.json({ ok: true, ...(mailConfigured() || !isDev ? {} : { devToken: token, devLink: link }) });
  })
);

router.post(
  '/reset-password',
  wrap(async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || req.body?.newPassword || '');
    if (!token || !password) throw httpError(400, 'token и password обязательны');
    if (password.length < 8) throw httpError(400, 'Пароль должен быть не короче 8 символов');

    const { rows } = await query('select * from users where reset_token = $1', [token]);
    const user = rows[0];
    if (!user) throw httpError(400, 'Ссылка недействительна');
    if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
      throw httpError(400, 'Срок действия ссылки истёк');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await query(
      `update users set password_hash = $2, reset_token = null, reset_token_expires = null,
         is_verified = true, updated_date = now() where id = $1 returning *`,
      [user.id, passwordHash]
    );
    res.json({ ok: true, access_token: signToken(updated.rows[0]), user: publicUser(updated.rows[0]) });
  })
);

// --- Google OAuth (необязательно) ---

const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const googleRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI || `${(process.env.PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '')}/api/auth/oauth/google/callback`;

router.get(
  '/oauth/google/start',
  wrap(async (req, res) => {
    if (!googleConfigured()) throw httpError(501, 'Вход через Google не настроен');
    const state = Buffer.from(JSON.stringify({ returnTo: req.query.returnTo || '/' })).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', googleRedirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  })
);

router.get(
  '/oauth/google/callback',
  wrap(async (req, res) => {
    if (!googleConfigured()) throw httpError(501, 'Вход через Google не настроен');
    const code = String(req.query.code || '');
    if (!code) throw httpError(400, 'Отсутствует code');

    let returnTo = '/';
    try {
      returnTo = JSON.parse(Buffer.from(String(req.query.state || ''), 'base64url').toString()).returnTo || '/';
    } catch {
      /* дефолт */
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw httpError(502, 'Google отклонил обмен кода');
    const tokens = await tokenRes.json();

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) throw httpError(502, 'Не удалось получить профиль Google');
    const profile = await infoRes.json();
    const email = normEmail(profile.email);
    if (!email) throw httpError(502, 'Google не вернул email');

    const { rows } = await query(
      `insert into users (email, is_verified, google_id, data)
       values ($1, true, $2, $3::jsonb)
       on conflict (email) do update set
         is_verified = true,
         google_id = coalesce(users.google_id, excluded.google_id),
         data = users.data || excluded.data,
         updated_date = now()
       returning *`,
      [email, profile.sub, JSON.stringify({ full_name: profile.name || '', avatar_url: profile.picture || '' })]
    );

    const token = signToken(rows[0]);
    const target = new URL(returnTo.startsWith('http') ? returnTo : appBaseUrl + returnTo);
    target.searchParams.set('access_token', token);
    res.redirect(target.toString());
  })
);

export default router;
