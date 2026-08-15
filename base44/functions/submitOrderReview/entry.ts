const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

async function recalc(base44, executorUserId) {
  const executors = await db.asServiceRole.entities.Executor.filter({ userId: executorUserId });
  const ex = executors[0];
  if (!ex) return;
  const reviews = await db.asServiceRole.entities.Review.filter({ executorId: executorUserId, hidden: false });
  const ratingAvg = reviews.length ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0;
  const orders = await db.asServiceRole.entities.Order.filter({ executorId: executorUserId });
  const completed = orders.filter((o) => o.status === 'COMPLETED').length;
  const cancelledByExecutor = orders.filter((o) => o.status === 'CANCELLED' && o.cancelledByRole === 'EXECUTOR').length;
  const cancelRate = orders.length ? cancelledByExecutor / orders.length : 0;
  await db.asServiceRole.entities.Executor.update(ex.id, {
    ratingAvg: Math.round(ratingAvg * 100) / 100,
    ordersCount: completed,
    cancelRate: Math.round(cancelRate * 100) / 100,
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await db.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Требуется вход' });

    const body = await req.json().catch(() => ({}));
    const { orderId, rating, comment } = body;
    if (!orderId || !rating) return Response.json({ ok: false, error: 'orderId и rating обязательны' });

    const order = await db.asServiceRole.entities.Order.get(orderId);
    if (!order) return Response.json({ ok: false, error: 'Наряд не найден' });
    if (order.clientId !== user.id) return Response.json({ ok: false, error: 'Отзыв может оставить только клиент наряда' });
    if (order.status !== 'COMPLETED') return Response.json({ ok: false, error: 'Отзыв доступен только после завершения наряда' });
    if (!order.executorId) return Response.json({ ok: false, error: 'У наряда нет исполнителя' });

    const existing = await db.asServiceRole.entities.Review.filter({ orderId, clientId: user.id });
    if (existing.length) return Response.json({ ok: false, error: 'Отзыв уже оставлен' });

    await db.asServiceRole.entities.Review.create({
      orderId,
      executorId: order.executorId,
      clientId: user.id,
      rating: Number(rating),
      comment: comment || '',
      hidden: false,
    });

    await recalc(base44, order.executorId);

    await db.asServiceRole.entities.Notification.create({
      userId: order.executorId,
      type: 'REVIEW',
      text: 'Получен отзыв по наряду ' + order.orderNumber,
      relatedOrderId: order.id,
    }).catch(() => {});

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}