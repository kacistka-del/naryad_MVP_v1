const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import BlankSheet from "@/components/BlankSheet";

export default function AdminStats() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const orders = await db.entities.Order.list("-created_date", 1000);
        const executors = await db.entities.Executor.list();
        const reviews = await db.entities.Review.list();

        const byStatus = {};
        orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
        const completed = orders.filter((o) => o.status === "COMPLETED");
        const commission = completed.reduce((s, o) => s + (o.commissionAmount || (o.finalPrice ? o.finalPrice * (o.commissionRate || 0) / 100 : 0)), 0);
        const gmv = completed.reduce((s, o) => s + (o.finalPrice || 0), 0);
        const approved = executors.filter((e) => e.moderationStatus === "APPROVED").length;
        const pending = executors.filter((e) => e.moderationStatus === "PENDING").length;
        const breaches = orders.filter((o) => o.slaBreachedAt).length;
        const auto = completed.filter((o) => o.autoCompleted).length;
        const avgRating = reviews.length ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0;

        setData({ total: orders.length, byStatus, completed: completed.length, commission, gmv, approved, pending, breaches, auto, avgRating, reviews: reviews.length });
      } catch (e) {}
    })();
  }, []);

  if (!data) return <p className="font-body text-sm text-ink-faint">Расчёт…</p>;

  const Row = ({ label, value }) => (
    <div className="flex justify-between border-b border-[hsl(var(--line))] py-1.5">
      <span className="font-body text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <BlankSheet className="paper-sheet--pad">
        <div className="font-heading uppercase tracking-wider text-sm mb-2 border-b border-[hsl(var(--line))] pb-1">Заказы</div>
        <Row label="Всего" value={data.total} />
        <Row label="Завершено" value={data.completed} />
        <Row label="Автозавершено" value={data.auto} />
        <Row label="SLA-нарушений" value={data.breaches} />
      </BlankSheet>
      <BlankSheet className="paper-sheet--pad">
        <div className="font-heading uppercase tracking-wider text-sm mb-2 border-b border-[hsl(var(--line))] pb-1">Экономика</div>
        <Row label="GMV (завершено)" value={data.gmv.toLocaleString("ru-RU") + " ₽"} />
        <Row label="Комиссия (расчёт)" value={data.commission.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"} />
        <Row label="Ср. рейтинг" value={data.avgRating.toFixed(2)} />
        <Row label="Отзывов" value={data.reviews} />
      </BlankSheet>
      <BlankSheet className="paper-sheet--pad md:col-span-2">
        <div className="font-heading uppercase tracking-wider text-sm mb-2 border-b border-[hsl(var(--line))] pb-1">Исполнители</div>
        <Row label="Одобрено" value={data.approved} />
        <Row label="На модерации" value={data.pending} />
      </BlankSheet>
    </div>
  );
}