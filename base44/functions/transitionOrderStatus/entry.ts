const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

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

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await db.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Требуется вход' });

    const body = await req.json().catch(() => ({}));
    const { orderId, toStatus, comment, patch = {} } = body;
    if (!orderId || !toStatus) return Response.json({ ok: false, error: 'orderId и toStatus обязательны' });

    const order = await db.asServiceRole.entities.Order.get(orderId);
    if (!order) return Response.json({ ok: false, error: 'Наряд не найден' });

    let role;
    if (user.role === 'admin') role = 'ADMIN';
    else if (order.clientId === user.id) role = 'CLIENT';
    else if (order.executorId === user.id) role = 'EXECUTOR';
    else return Response.json({ ok: false, error: 'Нет доступа к наряду' });

    if (order.status === toStatus) return Response.json({ ok: false, error: 'Статус уже актуален' });
    if (!canActorTransition(order.status, toStatus, role)) {
      return Response.json({ ok: false, error: `Переход ${order.status} → ${toStatus} недопустим для роли ${role}` });
    }

    const update = { status: toStatus };

    if (toStatus === 'CANCELLED') {
      update.cancelReason = comment || patch.cancelReason || 'Отмена';
      update.cancelledByRole = role;
    }
    if (toStatus === 'ASSIGNED') {
      if (!patch.executorId) return Response.json({ ok: false, error: 'executorId обязателен' });
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
      const fp = update.finalPrice != null ? update.finalPrice : order.finalPrice;
      if (fp) {
        let rate = order.commissionRate;
        if (rate == null) {
          const settings = await db.asServiceRole.entities.SystemSetting.filter({ key: 'commissionRate' });
          rate = settings[0]?.valueNumber ?? 10;
        }
        update.commissionRate = rate;
        update.commissionAmount = Math.round((fp * rate) / 100);
      }
    }

    const updated = await db.asServiceRole.entities.Order.update(order.id, update);

    try {
      await db.asServiceRole.entities.OrderStatusHistory.create({
        orderId: order.id,
        status: toStatus,
        authorRole: role,
        authorId: user.id,
        comment: comment || '',
      });
    } catch (e) {
      // best-effort откат статуса, если история не записалась
      await db.asServiceRole.entities.Order.update(order.id, { status: order.status }).catch(() => {});
      return Response.json({ ok: false, error: 'Не удалось записать историю перехода' });
    }

    if (role === 'ADMIN') {
      await db.asServiceRole.entities.AdminAuditLog.create({
        adminId: user.id,
        action: toStatus,
        entity: 'Order',
        entityId: order.id,
        details: comment || toStatus,
      }).catch(() => {});
    }

    const notifs = [];
    if (toStatus === 'ASSIGNED') {
      if (order.clientId) notifs.push({ userId: order.clientId, type: 'ASSIGNED', text: 'Назначен исполнитель по наряду ' + order.orderNumber });
      if (update.executorId) notifs.push({ userId: update.executorId, type: 'ASSIGNED', text: 'Вам назначен наряд ' + order.orderNumber });
    }
    if (toStatus === 'AWAITINGCONFIRMATION' && order.clientId) notifs.push({ userId: order.clientId, type: 'AWAITING', text: 'Исполнитель запрашивает подтверждение по наряду ' + order.orderNumber });
    if (toStatus === 'COMPLETED' && order.clientId) notifs.push({ userId: order.clientId, type: 'COMPLETED', text: 'Наряд ' + order.orderNumber + ' завершён' });
    if (toStatus === 'CANCELLED') {
      [order.clientId, order.executorId].forEach((uid) => { if (uid && uid !== user.id) notifs.push({ userId: uid, type: 'CANCELLED', text: 'Наряд ' + order.orderNumber + ' отменён' }); });
    }
    await Promise.all(
      notifs.map((n) => db.asServiceRole.entities.Notification.create({ userId: n.userId, type: n.type, text: n.text, relatedOrderId: order.id }).catch(() => {}))
    );

    return Response.json({ ok: true, order: updated });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}