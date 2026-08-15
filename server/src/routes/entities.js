import express from 'express';
import { store } from '../store.js';
import { authRequired, isAdmin } from '../middleware.js';
import { httpError, wrap } from '../http.js';

const router = express.Router();

const KNOWN_ENTITIES = new Set([
  'User',
  'Order',
  'OrderStatusHistory',
  'Executor',
  'Review',
  'Notification',
  'Message',
  'Category',
  'SystemSetting',
  'AdminAuditLog',
]);

// Поля, по которым запись считается «своей» для пользователя
const OWNER_FIELDS = {
  Order: ['clientId', 'executorId'],
  OrderStatusHistory: ['authorId'],
  Executor: ['userId'],
  Review: ['clientId', 'executorId'],
  Notification: ['userId'],
  Message: ['senderId', 'recipientId'],
};

// Читать может любой авторизованный пользователь
const PUBLIC_READ = new Set(['Category', 'SystemSetting', 'Executor', 'Review', 'OrderStatusHistory', 'Message']);
// Писать может только администратор
const ADMIN_WRITE = new Set(['Category', 'SystemSetting', 'AdminAuditLog']);
// Полностью закрытые для не-админа
const ADMIN_READ = new Set(['AdminAuditLog', 'User']);

function assertEntity(name) {
  if (!KNOWN_ENTITIES.has(name)) throw httpError(404, `Неизвестная сущность: ${name}`);
  return name;
}

function owns(user, entity, record) {
  if (!record) return false;
  if (record.created_by && record.created_by === user.id) return true;
  return (OWNER_FIELDS[entity] || []).some((field) => record[field] && record[field] === user.id);
}

router.use(authRequired);

router.get(
  '/:entity',
  wrap(async (req, res) => {
    const entity = assertEntity(req.params.entity);
    if (ADMIN_READ.has(entity) && !isAdmin(req.user)) throw httpError(403, 'Недостаточно прав');

    let where = {};
    if (req.query.filter) {
      try {
        where = JSON.parse(req.query.filter);
      } catch {
        throw httpError(400, 'filter должен быть JSON-объектом');
      }
    }

    const rows = await store.filter(entity, where, req.query.sort, req.query.limit);
    if (isAdmin(req.user) || PUBLIC_READ.has(entity)) return res.json(rows);
    res.json(rows.filter((row) => owns(req.user, entity, row)));
  })
);

router.get(
  '/:entity/:id',
  wrap(async (req, res) => {
    const entity = assertEntity(req.params.entity);
    if (ADMIN_READ.has(entity) && !isAdmin(req.user) && req.params.id !== req.user.id) {
      throw httpError(403, 'Недостаточно прав');
    }
    const record = await store.get(entity, req.params.id);
    if (!record) throw httpError(404, 'Запись не найдена');
    if (!isAdmin(req.user) && !PUBLIC_READ.has(entity) && !owns(req.user, entity, record)) {
      throw httpError(403, 'Нет доступа к записи');
    }
    res.json(record);
  })
);

router.post(
  '/:entity',
  wrap(async (req, res) => {
    const entity = assertEntity(req.params.entity);
    if (ADMIN_WRITE.has(entity) && !isAdmin(req.user)) throw httpError(403, 'Недостаточно прав');

    const payload = { ...(req.body || {}) };
    if (entity === 'Order' && !isAdmin(req.user)) {
      payload.clientId = req.user.id;
      payload.status = payload.status || 'NEW';
    }
    if (entity === 'Executor' && !isAdmin(req.user)) payload.userId = req.user.id;
    if (entity === 'Review' && !isAdmin(req.user)) payload.clientId = req.user.id;

    const created = await store.create(entity, payload, req.user.id);
    res.status(201).json(created);
  })
);

router.patch(
  '/:entity/:id',
  wrap(async (req, res) => {
    const entity = assertEntity(req.params.entity);
    if (ADMIN_WRITE.has(entity) && !isAdmin(req.user)) throw httpError(403, 'Недостаточно прав');

    if (entity === 'User') {
      if (!isAdmin(req.user) && req.params.id !== req.user.id) throw httpError(403, 'Недостаточно прав');
      return res.json(await store.updateUser(req.params.id, req.body || {}));
    }

    const record = await store.get(entity, req.params.id);
    if (!record) throw httpError(404, 'Запись не найдена');
    if (!isAdmin(req.user) && !owns(req.user, entity, record)) throw httpError(403, 'Нет доступа к записи');

    const patch = { ...(req.body || {}) };
    if (entity === 'Order' && !isAdmin(req.user) && patch.status && patch.status !== record.status) {
      throw httpError(400, 'Статус наряда меняется только через /api/functions/transitionOrderStatus');
    }

    res.json(await store.update(entity, req.params.id, patch));
  })
);

router.delete(
  '/:entity/:id',
  wrap(async (req, res) => {
    const entity = assertEntity(req.params.entity);
    if (ADMIN_WRITE.has(entity) && !isAdmin(req.user)) throw httpError(403, 'Недостаточно прав');

    const record = await store.get(entity, req.params.id);
    if (!record) throw httpError(404, 'Запись не найдена');
    if (!isAdmin(req.user) && !owns(req.user, entity, record)) throw httpError(403, 'Нет доступа к записи');

    res.json(await store.remove(entity, req.params.id));
  })
);

export default router;
