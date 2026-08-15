import express from 'express';
import { store } from '../store.js';
import { authRequired, isAdmin } from '../middleware.js';
import { httpError, wrap } from '../http.js';
import { invokeLLM, llmConfigured } from '../llm.js';

const router = express.Router();

/* ------------------------------------------------------------------ *
 * transitionOrderStatus — государственная машина статусов наряда
 * ------------------------------------------------------------------ */

const TRANSITIONS = {
  NEW: ['REVIEW', 'CANCELLED'],
  REVIEW: ['SEARCHING', 'NEEDSINFO', 'CANCELLED'],
  NEEDSINFO: ['REVIEW', 'CANCELLED'],
  SEARCHING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['CONFIRMED', 'SEARCHING', 'CANCELLED', 'DISPUTE'],
  CONFIRMED: ['INPROGRESS', 'CANCELLED', 'DISPUTE'],
  INPROGRESS: ['AWAITINGCONFIRMATION', 'CANCELLED', 'DISPUTE'],
  AWAITINGCONFIRMATION: ['COMPLETED', 'DISPUTE', 'CANCELLED'],
  DISPUTE: ['SEARCHING', 'INPROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function canActorTransition(from, to, role) {
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) return false;
  if (role === 'ADMIN') return true;
  if (role === 'CLIENT') {
    if (to === 'CANCELLED') return from !== 'COMPLETED' && from !== 'CANCELLED' && from !== 'DISPUTE';
    if (from === 'AWAITINGCONFIRMATION' && (to === 'COMPLETED' || to === 'DISPUTE')) return true;
    return false;
  }
  if (role === 'EXECUTOR') {
    if (from === 'ASSIGNED' && (to === 'CONFIRMED' || to === 'SEARCHING')) return true;
    if (from === 'CONFIRMED' && (to === 'INPROGRESS' || to === 'DISPUTE')) return true;
    if (from === 'INPROGRESS' && (to === 'AWAITINGCONFIRMATION' || to === 'DISPUTE')) return true;
    if (from === 'AWAITINGCONFIRMATION' && to === 'DISPUTE') return true;
    return false;
  }
  return false;
}

router.post(
  '/transitionOrderStatus',
  authRequired,
  wrap(async (req, res) => {
    const user = req.user;
    const { orderId, toStatus, comment, patch = {} } = req.body || {};
    if (!orderId || !toStatus) return res.json({ ok: false, error: 'orderId и toStatus обязательны' });

    const order = await store.get('Order', orderId);
    if (!order) return res.json({ ok: false, error: 'Наряд не найден' });

    let role;
    if (isAdmin(user)) role = 'ADMIN';
    else if (order.clientId === user.id) role = 'CLIENT';
    else if (order.executorId === user.id) role = 'EXECUTOR';
    else return res.json({ ok: false, error: 'Нет доступа к наряду' });

    if (order.status === toStatus) return res.json({ ok: false, error: 'Статус уже актуален' });
    if (!canActorTransition(order.status, toStatus, role)) {
      return res.json({ ok: false, error: `Переход ${order.status} → ${toStatus} недопустим для роли ${role}` });
    }

    const update = { status: toStatus };

    if (toStatus === 'CANCELLED') {
      update.cancelReason = comment || patch.cancelReason || 'Отмена';
      update.cancelledByRole = role;
    }
    if (toStatus === 'ASSIGNED') {
      if (!patch.executorId) return res.json({ ok: false, error: 'executorId обязателен' });
      update.executorId = patch.executorId;
      update.assignedAt = new Date().toISOString();
    }
    if (toStatus === 'SEARCHING' && order.status === 'ASSIGNED') {
      update.executorId = null;
      update.assignedAt = null;
    }
    if (toStatus === 'AWAITINGCONFIRMATION' && patch.finalPrice != null && patch.finalPrice !== '') {
      update.finalPrice = Number(patch.finalPrice);
    }
    if (toStatus === 'COMPLETED') {
      const finalPrice = update.finalPrice != null ? update.finalPrice : order.finalPrice;
      if (finalPrice) {
        let rate = order.commissionRate;
        if (rate == null) {
          const settings = await store.filter('SystemSetting', { key: 'commissionRate' });
          rate = settings[0]?.valueNumber ?? 10;
        }
        update.commissionRate = rate;
        update.commissionAmount = Math.round((finalPrice * rate) / 100);
      }
    }

    const updated = await store.update('Order', order.id, update);

    try {
      await store.create('OrderStatusHistory', {
        orderId: order.id,
        status: toStatus,
        authorRole: role,
        authorId: user.id,
        comment: comment || '',
      }, user.id);
    } catch {
      await store.update('Order', order.id, { status: order.status }).catch(() => {});
      return res.json({ ok: false, error: 'Не удалось записать историю перехода' });
    }

    if (role === 'ADMIN') {
      await store
        .create('AdminAuditLog', {
          adminId: user.id,
          action: toStatus,
          entity: 'Order',
          entityId: order.id,
          details: comment || toStatus,
        }, user.id)
        .catch(() => {});
    }

    const notifications = [];
    if (toStatus === 'ASSIGNED') {
      if (order.clientId) notifications.push({ userId: order.clientId, type: 'ASSIGNED', text: 'Назначен исполнитель по наряду ' + order.orderNumber });
      if (update.executorId) notifications.push({ userId: update.executorId, type: 'ASSIGNED', text: 'Вам назначен наряд ' + order.orderNumber });
    }
    if (toStatus === 'AWAITINGCONFIRMATION' && order.clientId) {
      notifications.push({ userId: order.clientId, type: 'AWAITING', text: 'Исполнитель запрашивает подтверждение по наряду ' + order.orderNumber });
    }
    if (toStatus === 'COMPLETED' && order.clientId) {
      notifications.push({ userId: order.clientId, type: 'COMPLETED', text: 'Наряд ' + order.orderNumber + ' завершён' });
    }
    if (toStatus === 'CANCELLED') {
      [order.clientId, order.executorId].forEach((uid) => {
        if (uid && uid !== user.id) notifications.push({ userId: uid, type: 'CANCELLED', text: 'Наряд ' + order.orderNumber + ' отменён' });
      });
    }

    await Promise.all(
      notifications.map((n) =>
        store.create('Notification', { userId: n.userId, type: n.type, text: n.text, relatedOrderId: order.id }, user.id).catch(() => {})
      )
    );

    res.json({ ok: true, order: updated });
  })
);

/* ------------------------------------------------------------------ *
 * submitOrderReview — отзыв клиента + пересчёт рейтинга
 * ------------------------------------------------------------------ */

async function recalcExecutorStats(executorUserId) {
  const executors = await store.filter('Executor', { userId: executorUserId });
  const executor = executors[0];
  if (!executor) return;

  const reviews = await store.filter('Review', { executorId: executorUserId, hidden: false });
  const ratingAvg = reviews.length ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length : 0;

  const orders = await store.filter('Order', { executorId: executorUserId }, null, 2000);
  const completed = orders.filter((o) => o.status === 'COMPLETED').length;
  const cancelledByExecutor = orders.filter((o) => o.status === 'CANCELLED' && o.cancelledByRole === 'EXECUTOR').length;
  const cancelRate = orders.length ? cancelledByExecutor / orders.length : 0;

  await store.update('Executor', executor.id, {
    ratingAvg: Math.round(ratingAvg * 100) / 100,
    ordersCount: completed,
    cancelRate: Math.round(cancelRate * 100) / 100,
  });
}

router.post(
  '/submitOrderReview',
  authRequired,
  wrap(async (req, res) => {
    const user = req.user;
    const { orderId, rating, comment } = req.body || {};
    if (!orderId || !rating) return res.json({ ok: false, error: 'orderId и rating обязательны' });

    const order = await store.get('Order', orderId);
    if (!order) return res.json({ ok: false, error: 'Наряд не найден' });
    if (order.clientId !== user.id) return res.json({ ok: false, error: 'Отзыв может оставить только клиент наряда' });
    if (order.status !== 'COMPLETED') return res.json({ ok: false, error: 'Отзыв доступен только после завершения наряда' });
    if (!order.executorId) return res.json({ ok: false, error: 'У наряда нет исполнителя' });

    const existing = await store.filter('Review', { orderId, clientId: user.id });
    if (existing.length) return res.json({ ok: false, error: 'Отзыв уже оставлен' });

    await store.create('Review', {
      orderId,
      executorId: order.executorId,
      clientId: user.id,
      rating: Number(rating),
      comment: comment || '',
      hidden: false,
    }, user.id);

    await recalcExecutorStats(order.executorId);

    await store
      .create('Notification', {
        userId: order.executorId,
        type: 'REVIEW',
        text: 'Получен отзыв по наряду ' + order.orderNumber,
        relatedOrderId: order.id,
      }, user.id)
      .catch(() => {});

    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ *
 * runPlanner — SLA-контроль и автономные действия
 * Запуск: админ из панели или cron с заголовком X-Cron-Token
 * ------------------------------------------------------------------ */

const DEFAULTS = {
  timeoutNewHours: 4,
  timeoutAssignedHours: 24,
  timeoutAwaitingConfirmHours: 72,
  searchRetryMinutes: 30,
  autonomyLevel: 'L1',
};

const levelOf = (s) => (s === 'L3' ? 3 : s === 'L2' ? 2 : s === 'L0' ? 0 : 1);
const hoursSince = (d) => {
  if (!d) return Infinity;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 3_600_000;
};
const minutesSince = (d) => hoursSince(d) * 60;

router.post(
  '/runPlanner',
  wrap(async (req, res) => {
    const cronToken = process.env.CRON_TOKEN;
    const viaCron = cronToken && req.headers['x-cron-token'] === cronToken;
    if (!viaCron && !isAdmin(req.user)) throw httpError(403, 'Доступно администратору или cron-задаче');

    const settingsList = await store.list('SystemSetting', null, 500);
    const settings = { ...DEFAULTS };
    settingsList.forEach((item) => {
      if (item.valueNumber !== undefined && item.valueNumber !== null) settings[item.key] = item.valueNumber;
      else if (item.value) settings[item.key] = item.value;
    });
    const level = levelOf(settings.autonomyLevel);

    const orders = await store.list('Order', '-created_date', 1000);
    const now = new Date().toISOString();
    const results = { flagged: 0, autoCompleted: 0, reassigned: 0, autoReviewed: 0 };

    for (const order of orders) {
      if (['COMPLETED', 'CANCELLED'].includes(order.status)) continue;

      let breach = false;
      let reason = '';
      if (order.status === 'NEW' && hoursSince(order.created_date) >= settings.timeoutNewHours) {
        breach = true;
        reason = 'NEW';
      } else if (order.status === 'ASSIGNED' && order.assignedAt && hoursSince(order.assignedAt) >= settings.timeoutAssignedHours) {
        breach = true;
        reason = 'ASSIGNED';
      } else if (order.status === 'AWAITINGCONFIRMATION' && hoursSince(order.updated_date) >= settings.timeoutAwaitingConfirmHours) {
        breach = true;
        reason = 'AWAITINGCONFIRMATION';
      } else if (order.status === 'SEARCHING' && minutesSince(order.updated_date) >= settings.searchRetryMinutes) {
        breach = true;
        reason = 'SEARCHING';
      }

      if (!breach) continue;

      if (!order.slaBreachedAt) {
        await store.update('Order', order.id, { slaBreachedAt: now });
        await store.create('OrderStatusHistory', {
          orderId: order.id,
          status: order.status,
          authorRole: 'SYSTEM',
          comment: 'SLA нарушен (' + reason + ')',
        });
        results.flagged++;
      }

      if (order.status === 'AWAITINGCONFIRMATION' && level >= 2) {
        await store.update('Order', order.id, { status: 'COMPLETED', autoCompleted: true });
        await store.create('OrderStatusHistory', {
          orderId: order.id,
          status: 'COMPLETED',
          authorRole: 'SYSTEM',
          comment: 'Автоподтверждение по таймауту',
        });
        if (order.clientId) {
          await store.create('Notification', {
            userId: order.clientId,
            type: 'AUTO_COMPLETED',
            text: 'Наряд ' + order.orderNumber + ' автозавершён',
            relatedOrderId: order.id,
          });
        }
        results.autoCompleted++;
      } else if (order.status === 'ASSIGNED' && level >= 2) {
        await store.update('Order', order.id, { status: 'SEARCHING', executorId: null, assignedAt: null });
        await store.create('OrderStatusHistory', {
          orderId: order.id,
          status: 'SEARCHING',
          authorRole: 'SYSTEM',
          comment: 'Исполнитель не отозвался — возврат в поиск',
        });
        results.reassigned++;
      } else if (order.status === 'NEW' && level >= 3) {
        await store.update('Order', order.id, { status: 'REVIEW' });
        await store.create('OrderStatusHistory', {
          orderId: order.id,
          status: 'REVIEW',
          authorRole: 'SYSTEM',
          comment: 'Автопроверка по таймауту',
        });
        results.autoReviewed++;
      }
    }

    res.json({ ok: true, settings, results });
  })
);

/* ------------------------------------------------------------------ *
 * structureOrder — подсказка структуры наряда по описанию
 * ------------------------------------------------------------------ */

function heuristicSuggestion(description, categories) {
  const text = description.toLowerCase();
  const match = categories.find((c) => {
    const name = String(c.name || '').toLowerCase();
    return name && text.includes(name.split(' ')[0]);
  });
  return {
    categoryId: match?.code || categories[0]?.code || null,
    specialties: [],
    estimatedComplexity: text.length > 400 ? 'high' : text.length > 150 ? 'medium' : 'low',
    estimatedCost: { min: 0, max: 0, currency: 'RUB' },
    estimatedDurationDays: 1,
    clarifyingQuestions: [
      'Уточните адрес и желаемую дату выполнения.',
      'Какой бюджет вы планируете?',
      'Нужны ли материалы или инструмент от исполнителя?',
    ],
    confidence: 0.3,
    source: 'heuristic',
  };
}

router.post(
  '/structureOrder',
  authRequired,
  wrap(async (req, res) => {
    const description = String(req.body?.description || '').trim();
    if (description.length < 5) throw httpError(400, 'Описание слишком короткое');

    const categories = (await store.list('Category', null, 500)).filter((c) => !c.isArchived);
    const catList = categories.map((c) => `${c.code} — ${c.name}`).join('\n');

    if (!llmConfigured()) {
      return res.json({ suggestion: heuristicSuggestion(description, categories) });
    }

    const prompt = [
      'Ты — ассистент сервиса бытовых заказов «НАРЯД».',
      'На основе описания задачи предложи структуру наряда.',
      'Доступные категории (используй поле code как categoryId):',
      catList,
      '',
      `Описание задачи: "${description}"`,
      '',
      'Верни JSON со следующими полями:',
      'categoryId, specialties, estimatedComplexity (low|medium|high),',
      'estimatedCost { min, max, currency:"RUB" }, estimatedDurationDays,',
      'clarifyingQuestions (массив вопросов на русском), confidence (0..1).',
      'Не выдумывай категории, не вошедшие в список.',
    ].join('\n');

    const suggestion = await invokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          specialties: { type: 'array', items: { type: 'string' } },
          estimatedComplexity: { type: 'string', enum: ['low', 'medium', 'high'] },
          estimatedCost: {
            type: 'object',
            properties: { min: { type: 'number' }, max: { type: 'number' }, currency: { type: 'string' } },
          },
          estimatedDurationDays: { type: 'number' },
          clarifyingQuestions: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
        },
      },
    });

    res.json({ suggestion: suggestion || heuristicSuggestion(description, categories) });
  })
);

export default router;
