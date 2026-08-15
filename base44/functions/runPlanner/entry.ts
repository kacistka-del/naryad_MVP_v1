const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DEFAULTS = {
  timeoutNewHours: 4,
  timeoutAssignedHours: 24,
  timeoutAwaitingConfirmHours: 72,
  searchRetryMinutes: 30,
  autonomyLevel: 'L1',
};

function lvl(s) {
  return s === 'L3' ? 3 : s === 'L2' ? 2 : s === 'L0' ? 0 : 1;
}
function hoursSince(d) {
  if (!d) return Infinity;
  const t = new Date(d).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}
function minsSince(d) {
  return hoursSince(d) * 60;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Настройки системы
    const settingsList = await db.asServiceRole.entities.SystemSetting.list();
    const s = { ...DEFAULTS };
    settingsList.forEach((set) => {
      if (set.valueNumber !== undefined && set.valueNumber !== null) s[set.key] = set.valueNumber;
      else if (set.value) s[set.key] = set.value;
    });
    const L = lvl(s.autonomyLevel);

    const orders = await db.asServiceRole.entities.Order.list('-created_date', 1000);
    const now = new Date().toISOString();
    const results = { flagged: 0, autoCompleted: 0, reassigned: 0, autoReviewed: 0 };

    for (const o of orders) {
      if (['COMPLETED', 'CANCELLED'].includes(o.status)) continue;

      let breach = false;
      let reason = '';
      if (o.status === 'NEW') {
        if (hoursSince(o.created_date) >= s.timeoutNewHours) { breach = true; reason = 'NEW'; }
      } else if (o.status === 'ASSIGNED') {
        if (o.assignedAt && hoursSince(o.assignedAt) >= s.timeoutAssignedHours) { breach = true; reason = 'ASSIGNED'; }
      } else if (o.status === 'AWAITINGCONFIRMATION') {
        if (hoursSince(o.updated_date) >= s.timeoutAwaitingConfirmHours) { breach = true; reason = 'AWAITINGCONFIRMATION'; }
      } else if (o.status === 'SEARCHING') {
        if (minsSince(o.updated_date) >= s.searchRetryMinutes) { breach = true; reason = 'SEARCHING'; }
      }

      // Фиксация SLA-нарушения (на любом уровне — для ручного контроля)
      if (breach && !o.slaBreachedAt) {
        await db.asServiceRole.entities.Order.update(o.id, { slaBreachedAt: now });
        await db.asServiceRole.entities.OrderStatusHistory.create({
          orderId: o.id, status: o.status, authorRole: 'SYSTEM', comment: 'SLA нарушен (' + reason + ')',
        });
        results.flagged++;
      }

      // Автономные действия по уровню
      if (breach) {
        if (o.status === 'AWAITINGCONFIRMATION' && L >= 2) {
          await db.asServiceRole.entities.Order.update(o.id, { status: 'COMPLETED', autoCompleted: true });
          await db.asServiceRole.entities.OrderStatusHistory.create({
            orderId: o.id, status: 'COMPLETED', authorRole: 'SYSTEM', comment: 'Автоподтверждение по таймауту',
          });
          if (o.clientId) await db.asServiceRole.entities.Notification.create({
            userId: o.clientId, type: 'AUTO_COMPLETED', text: 'Наряд ' + o.orderNumber + ' автозавершён', relatedOrderId: o.id,
          });
          results.autoCompleted++;
        } else if (o.status === 'ASSIGNED' && L >= 2) {
          await db.asServiceRole.entities.Order.update(o.id, { status: 'SEARCHING', executorId: null, assignedAt: null });
          await db.asServiceRole.entities.OrderStatusHistory.create({
            orderId: o.id, status: 'SEARCHING', authorRole: 'SYSTEM', comment: 'Исполнитель не отозвался — возврат в поиск',
          });
          results.reassigned++;
        } else if (o.status === 'NEW' && L >= 3) {
          await db.asServiceRole.entities.Order.update(o.id, { status: 'REVIEW' });
          await db.asServiceRole.entities.OrderStatusHistory.create({
            orderId: o.id, status: 'REVIEW', authorRole: 'SYSTEM', comment: 'Автопроверка по таймауту',
          });
          results.autoReviewed++;
        }
      }
    }

    return Response.json({ ok: true, settings: s, results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}