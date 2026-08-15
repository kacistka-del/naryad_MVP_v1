/**
 * Собственный клиент данных вместо @base44/sdk.
 *
 * Повторяет поверхность, которую использует код страниц:
 *   db.auth.*            — вход, регистрация, профиль
 *   db.entities.<Name>.* — list / filter / get / create / update / delete
 *   db.functions.invoke  — серверные функции
 *   db.integrations.Core — UploadFile / InvokeLLM
 *
 * Все запросы идут в собственный backend (server/).
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'naryad_access_token';

/* --------------------------- токен --------------------------- */

function takeTokenFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('access_token');
  if (!token) return;
  window.localStorage.setItem(TOKEN_KEY, token);
  params.delete('access_token');
  const search = params.toString();
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
  );
}

takeTokenFromUrl();

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined' || !token) return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

/* --------------------------- транспорт --------------------------- */

async function request(path, { method = 'GET', body, query, formData } = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
  }

  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!formData) headers['Content-Type'] = 'application/json';

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: raw };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || response.statusText || 'Ошибка запроса');
    error.status = response.status;
    error.data = payload;
    if (response.status === 401) clearToken();
    throw error;
  }

  return payload;
}

/* --------------------------- сущности --------------------------- */

function entityApi(name) {
  const base = `/entities/${name}`;
  return {
    list: (sort, limit) => request(base, { query: { sort, limit } }),
    filter: (where = {}, sort, limit) => request(base, { query: { filter: where, sort, limit } }),
    get: (id) => request(`${base}/${id}`),
    create: (data) => request(base, { method: 'POST', body: data }),
    update: (id, data) => request(`${base}/${id}`, { method: 'PATCH', body: data }),
    delete: (id) => request(`${base}/${id}`, { method: 'DELETE' }),
    bulkCreate: (items = []) => Promise.all(items.map((item) => request(base, { method: 'POST', body: item }))),
  };
}

const entities = new Proxy(
  {},
  {
    get(cache, name) {
      if (typeof name !== 'string') return undefined;
      if (!cache[name]) cache[name] = entityApi(name);
      return cache[name];
    },
  }
);

/* --------------------------- авторизация --------------------------- */

async function loginViaEmailPassword(email, password) {
  const result = await request('/auth/login', { method: 'POST', body: { email, password } });
  if (result?.access_token) setToken(result.access_token);
  return result;
}

async function register(payload = {}) {
  return request('/auth/register', { method: 'POST', body: payload });
}

async function verifyOtp({ email, otpCode }) {
  const result = await request('/auth/verify-otp', { method: 'POST', body: { email, otpCode } });
  if (result?.access_token) setToken(result.access_token);
  return result;
}

const auth = {
  // текущий пользователь
  me: () => request('/auth/me'),
  isAuthenticated: async () => {
    if (!getToken()) return false;
    try {
      await request('/auth/me');
      return true;
    } catch {
      return false;
    }
  },

  // вход / регистрация
  loginViaEmailPassword,
  login: (email, password) =>
    typeof email === 'object'
      ? loginViaEmailPassword(email.email, email.password)
      : loginViaEmailPassword(email, password),
  register,
  signUp: register,
  verifyOtp,
  resendOtp: (email) => request('/auth/resend-otp', { method: 'POST', body: { email } }),

  // профиль
  updateMe: (patch) => request('/auth/me', { method: 'PATCH', body: patch }),
  updateMyUserData: (patch) => request('/auth/me', { method: 'PATCH', body: patch }),

  // сброс пароля
  requestPasswordReset: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  sendPasswordResetEmail: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => {
    const body = typeof token === 'object' ? token : { token, password };
    return request('/auth/reset-password', { method: 'POST', body });
  },

  // токены
  setToken,
  getToken,

  // внешние провайдеры
  loginWithProvider: (provider = 'google', returnTo = '/') => {
    const url = new URL(`${API_BASE}/auth/oauth/${provider}/start`, window.location.origin);
    url.searchParams.set('returnTo', returnTo);
    window.location.href = url.toString();
  },

  redirectToLogin: (returnTo) => {
    const target = returnTo || window.location.href;
    const login = new URL('/login', window.location.origin);
    login.searchParams.set('returnTo', target);
    window.location.href = login.toString();
  },

  logout: (redirectTo) => {
    clearToken();
    request('/auth/logout', { method: 'POST' }).catch(() => {});
    if (redirectTo) window.location.href = redirectTo;
  },
};

/* --------------------------- функции и интеграции --------------------------- */

const functions = {
  // совместимо с base44: возвращает { data }
  invoke: async (name, payload = {}) => ({
    data: await request(`/functions/${name}`, { method: 'POST', body: payload }),
  }),
};

const integrations = {
  Core: {
    UploadFile: async ({ file }) => {
      const formData = new FormData();
      formData.append('file', file);
      return request('/uploads', { method: 'POST', formData });
    },
    InvokeLLM: (payload) => request('/llm/invoke', { method: 'POST', body: payload }),
  },
};

export const db = {
  auth,
  entities,
  functions,
  integrations,
  // в base44 это был сервисный обход прав; теперь права проверяет backend
  get asServiceRole() {
    return db;
  },
};

export default db;
