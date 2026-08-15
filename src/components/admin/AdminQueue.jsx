const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BlankSheet from "@/components/BlankSheet";
import StatusStamp from "@/components/StatusStamp";

import { STATUS_LIST, STATUS_META } from "@/lib/orders";

function fmtDate(d) { return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }

export default function AdminQueue() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("EXCEPTIONS");

  const load = async () => {
    setLoading(true);
    try {
      const list = await db.entities.Order.list("-created_date", 200);
      setOrders(list);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const exceptions = orders.filter((o) => ["DISPUTE", "NEEDSINFO"].includes(o.status));
  const shown = filter === "EXCEPTIONS" ? exceptions : filter === "ALL" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div>
      <div className="flex items-end justify-between mb-3">
        <div className="font-mono text-xs text-ink-faint">всего: {orders.length} · исключений: {exceptions.length}</div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button onClick={() => setFilter("EXCEPTIONS")} className={`px-2.5 py-1 text-xs font-mono uppercase ${filter === "EXCEPTIONS" ? "btn-ink" : "btn-outline-ink"}`}>Очередь ({exceptions.length})</button>
        <button onClick={() => setFilter("ALL")} className={`px-2.5 py-1 text-xs font-mono uppercase ${filter === "ALL" ? "btn-ink" : "btn-outline-ink"}`}>Все</button>
        {STATUS_LIST.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-2.5 py-1 text-xs font-mono uppercase ${filter === s ? "btn-ink" : "btn-outline-ink"}`}>{STATUS_META[s].label}</button>
        ))}
      </div>
      {loading ? <p className="font-body text-sm text-ink-faint">Загрузка…</p> : shown.length === 0 ? (
        <BlankSheet className="paper-sheet--pad text-center"><p className="font-body text-sm text-ink-faint">Пусто.</p></BlankSheet>
      ) : (
        <div className="space-y-2">
          {shown.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="block paper-sheet paper-sheet--pad hover:bg-[hsl(var(--muted))]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold">{o.orderNumber}</span>
                <StatusStamp status={o.status} size="sm" rotate={false} />
                <span className="font-mono text-[11px] text-ink-faint">{fmtDate(o.created_date)}</span>
                <span className="font-mono text-[11px] text-ink-faint">{o.categoryCode}</span>
                <span className="font-mono text-[11px] text-ink-faint">{o.city}</span>
                {o.slaBreachedAt && <span className="stamp stamp-red px-2 py-0.5 text-[10px] font-mono uppercase">SLA</span>}
              </div>
              <p className="font-body text-sm mt-1 line-clamp-1">{o.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}