import { query } from './db.js';
import { httpError } from './http.js';

const IDENT = /^[A-Za-z0-9_]+$/;
const COLUMN_FIELDS = new Set(['id', 'created_date', 'updated_date', 'created_by']);

function flatten(row) {
  return {
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by: row.created_by,
    ...(row.data || {}),
  };
}

export function publicUser(row) {
  if (!row) return null;
  const data = row.data || {};
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    is_verified: row.is_verified,
    is_blocked: row.is_blocked,
    created_date: row.created_date,
    updated_date: row.updated_date,
    ...data,
  };
}

function orderByClause(sort) {
  if (!sort) return 'created_date desc';
  const desc = String(sort).startsWith('-');
  const field = desc ? String(sort).slice(1) : String(sort);
  if (!IDENT.test(field)) return 'created_date desc';
  const dir = desc ? 'desc' : 'asc';
  if (COLUMN_FIELDS.has(field)) return `${field} ${dir}`;
  return `data->>'${field}' ${dir}`;
}

function cleanPayload(payload = {}) {
  const data = { ...payload };
  delete data.id;
  delete data.created_date;
  delete data.updated_date;
  delete data.created_by;
  return data;
}

async function nextOrderNumber() {
  const { rows } = await query("select nextval('order_number_seq') as seq");
  const seq = String(rows[0].seq).padStart(6, '0');
  return `Н-${new Date().getFullYear()}-${seq}`;
}

async function filterUsers(where = {}, sort, limit = 500) {
  const params = [];
  const conditions = [];
  const dataWhere = {};
  for (const [key, value] of Object.entries(where || {})) {
    if (['id', 'email', 'role', 'is_verified', 'is_blocked'].includes(key)) {
      params.push(value);
      conditions.push(`${key} = $${params.length}`);
    } else {
      dataWhere[key] = value;
    }
  }
  if (Object.keys(dataWhere).length) {
    params.push(JSON.stringify(dataWhere));
    conditions.push(`data @> $${params.length}::jsonb`);
  }
  params.push(Math.min(Number(limit) || 500, 2000));
  const sql = `select * from users ${conditions.length ? 'where ' + conditions.join(' and ') : ''} order by ${orderByClause(sort)} limit $${params.length}`;
  const { rows } = await query(sql, params);
  return rows.map(publicUser);
}

export const store = {
  async filter(entity, where = {}, sort, limit = 500) {
    if (entity === 'User') return filterUsers(where, sort, limit);

    const params = [entity];
    const conditions = ['entity = $1'];
    const dataWhere = {};

    for (const [key, value] of Object.entries(where || {})) {
      if (key === 'id' || key === 'created_by') {
        params.push(value);
        conditions.push(`${key} = $${params.length}`);
      } else {
        dataWhere[key] = value;
      }
    }
    if (Object.keys(dataWhere).length) {
      params.push(JSON.stringify(dataWhere));
      conditions.push(`data @> $${params.length}::jsonb`);
    }
    params.push(Math.min(Number(limit) || 500, 2000));

    const sql = `select * from records where ${conditions.join(' and ')} order by ${orderByClause(sort)} limit $${params.length}`;
    const { rows } = await query(sql, params);
    return rows.map(flatten);
  },

  list(entity, sort, limit = 500) {
    return this.filter(entity, {}, sort, limit);
  },

  async get(entity, id) {
    if (!id) return null;
    if (entity === 'User') {
      const { rows } = await query('select * from users where id = $1', [id]);
      return publicUser(rows[0]);
    }
    const { rows } = await query('select * from records where entity = $1 and id = $2', [entity, id]);
    return rows[0] ? flatten(rows[0]) : null;
  },

  async create(entity, payload = {}, createdBy = null) {
    if (entity === 'User') throw httpError(400, 'Пользователи создаются через /api/auth/register');
    const data = cleanPayload(payload);
    if (entity === 'Order' && !data.orderNumber) data.orderNumber = await nextOrderNumber();
    const { rows } = await query(
      'insert into records (entity, data, created_by) values ($1, $2::jsonb, $3) returning *',
      [entity, JSON.stringify(data), createdBy]
    );
    return flatten(rows[0]);
  },

  async update(entity, id, patch = {}) {
    if (entity === 'User') return this.updateUser(id, patch);
    const data = cleanPayload(patch);
    const { rows } = await query(
      'update records set data = data || $3::jsonb, updated_date = now() where entity = $1 and id = $2 returning *',
      [entity, id, JSON.stringify(data)]
    );
    if (!rows[0]) throw httpError(404, 'Запись не найдена');
    return flatten(rows[0]);
  },

  async updateUser(id, patch = {}) {
    const { role, is_blocked: isBlocked, ...rest } = patch || {};
    const data = cleanPayload(rest);
    delete data.email;
    delete data.password;
    const { rows } = await query(
      `update users set
         data = data || $2::jsonb,
         role = coalesce($3, role),
         is_blocked = coalesce($4, is_blocked),
         updated_date = now()
       where id = $1 returning *`,
      [id, JSON.stringify(data), role ?? null, typeof isBlocked === 'boolean' ? isBlocked : null]
    );
    if (!rows[0]) throw httpError(404, 'Пользователь не найден');
    return publicUser(rows[0]);
  },

  async remove(entity, id) {
    if (entity === 'User') throw httpError(400, 'Удаление пользователей запрещено');
    const { rows } = await query('delete from records where entity = $1 and id = $2 returning id', [entity, id]);
    if (!rows[0]) throw httpError(404, 'Запись не найдена');
    return { id: rows[0].id, deleted: true };
  },
};
