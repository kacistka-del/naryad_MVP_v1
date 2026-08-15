const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";
import StatusStamp from "@/components/StatusStamp";

import { STATUS_LIST, STATUS_META } from "@/lib/orders";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ClientCabinet() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  const load = async () => {
    setLoading(true);
    try {
      const list = await db.entities.Order.list("-created_date", 100);
      setOrders(list);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === "ALL" ? orders : orders.filter((o) => o.status === filter);
  const needsInfo = orders.filter((o) => o.status === "NEEDSINFO");

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-4 border-b border-[hsl(var(--line))] pb-2">
          <div>
            <h1 className="blank-title text-xl font-bold">Мои наряды</h1>
            <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">клиент · {user?.full_name}</div>
          </div>
          <Link to="/orders/new" className="btn-ink px-4 py-2 text-xs">+ Новый наряд</Link>
        </div>

        {needsInfo.length > 0 && (
          <div className="paper-sheet paper-sheet--pad mb-4 border-l-4" style={{ borderLeftColor: "hsl(var(--stamp-amber))" }}>
            <div className="font-heading uppercase tracking-wider text-sm">На доработке: {needsInfo.length}</div>
            <p className="font-body text-sm text-ink-faint mt-1">Координатор вернул заявки — откройте и уточните детали.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setFilter("ALL")} className={`px-2.5 py-1 text-xs font-mono uppercase ${filter === "ALL" ? "btn-ink" : "btn-outline-ink"}`}>Все</button>
          {STATUS_LIST.map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`px-2.5 py-1 text-xs font-mono uppercase ${filter === s ? "btn-ink" : "btn-outline-ink"}`}>
              {STATUS_META[s].label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="font-body text-sm text-ink-faint">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <BlankSheet className="paper-sheet--pad text-center">
            <p className="font-body text-sm text-ink-faint">Нарядов нет. Оформите первый.</p>
          </BlankSheet>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="block paper-sheet paper-sheet--pad hover:bg-[hsl(var(--muted))] transition-colors">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-bold">{o.orderNumber}</span>
                  <StatusStamp status={o.status} size="sm" rotate={false} />
                  <span className="font-mono text-[11px] text-ink-faint">{fmtDate(o.created_date)}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{o.categoryCode}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{o.city}</span>
                </div>
                <p className="font-body text-sm mt-1 line-clamp-1">{o.description}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}