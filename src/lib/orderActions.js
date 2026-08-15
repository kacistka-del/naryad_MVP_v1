const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };


import { canTransition } from "./orders";

export async function addHistory(orderId, status, authorRole, comment) {
  return db.entities.OrderStatusHistory.create({
    orderId,
    status,
    authorRole,
    comment: comment || "",
  });
}

export async function notifyUser(userId, type, text, relatedOrderId) {
  if (!userId) return;
  try {
    await db.entities.Notification.create({
      userId,
      type,
      text,
      relatedOrderId,
    });
  } catch (e) {
    /* уведомления не должны блокировать переход */
  }
}

export async function transitionOrder(order, toStatus, opts = {}) {
  const { comment, patch = {} } = opts;
  let res;
  try {
    res = await db.functions.invoke("transitionOrderStatus", {
      orderId: order.id,
      toStatus,
      comment,
      patch,
    });
  } catch (e) {
    throw new Error(e?.data?.error || e.message || "Переход недоступен");
  }
  if (!res?.data?.ok) throw new Error(res?.data?.error || "Переход недоступен");
  return res.data.order || order;
}

// Ранжирование кандидатов: категория → рейтинг → cancelRate → загрузка → давность
export function rankCandidates(executors) {
  return [...executors].sort((a, b) => {
    if ((b.ratingAvg || 0) !== (a.ratingAvg || 0)) return (b.ratingAvg || 0) - (a.ratingAvg || 0);
    if ((a.cancelRate || 0) !== (b.cancelRate || 0)) return (a.cancelRate || 0) - (b.cancelRate || 0);
    if ((a.activeOrders || 0) !== (b.activeOrders || 0)) return (a.activeOrders || 0) - (b.activeOrders || 0);
    return new Date(a.created_date) - new Date(b.created_date);
  });
}

// Эвристический детектор обмена контактами
export function detectContactExchange(text) {
  if (!text) return false;
  const phone = /(\+?\d[\d\s\-().]{6,}\d)/;
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const messengers = /(telegram|телеграм|whatsapp|ватсап|viber|вайбер|@[a-z0-9_]{3,})/i;
  return phone.test(text) || email.test(text) || messengers.test(text);
}

export async function auditLog(action, entity, entityId, details, adminId) {
  try {
    await db.entities.AdminAuditLog.create({
      adminId,
      action,
      entity,
      entityId,
      details: details || "",
    });
  } catch (e) {
    /* аудит не должен блокировать действие */
  }
}

export async function recalcExecutorStats(executorUserId) {
  const executors = await db.entities.Executor.filter({ userId: executorUserId });
  const ex = executors[0];
  if (!ex) return;
  const reviews = await db.entities.Review.filter({ executorId: executorUserId, hidden: false });
  const ratingAvg = reviews.length
    ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
    : 0;
  const orders = await db.entities.Order.filter({ executorId: executorUserId });
  const completed = orders.filter((o) => o.status === "COMPLETED").length;
  const cancelledByExecutor = orders.filter(
    (o) => o.status === "CANCELLED" && o.cancelledByRole === "EXECUTOR"
  ).length;
  const cancelRate = orders.length ? cancelledByExecutor / orders.length : 0;
  await db.entities.Executor.update(ex.id, {
    ratingAvg: Math.round(ratingAvg * 100) / 100,
    ordersCount: completed,
    cancelRate: Math.round(cancelRate * 100) / 100,
  });
}

export async function submitReview(order, executorUserId, clientId, rating, comment) {
  let res;
  try {
    res = await db.functions.invoke("submitOrderReview", {
      orderId: order.id,
      rating,
      comment,
    });
  } catch (e) {
    throw new Error(e?.data?.error || e.message || "Не удалось оставить отзыв");
  }
  if (!res?.data?.ok) throw new Error(res?.data?.error || "Не удалось оставить отзыв");
  return res.data;
}