const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import BlankSheet from "@/components/BlankSheet";

import { auditLog, recalcExecutorStats } from "@/lib/orderActions";

function fmt(d) { return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }); }

export default function AdminReviews() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [executors, setExecutors] = useState({});
  const [loading, setLoading] = useState(true);
  const [onlyHidden, setOnlyHidden] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await db.entities.Review.list("-created_date", 200);
      setReviews(list);
      const ex = await db.entities.Executor.list();
      const map = {};
      ex.forEach((e) => { if (e.userId) map[e.userId] = e.fullName; });
      setExecutors(map);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (r) => {
    await db.entities.Review.update(r.id, { hidden: !r.hidden });
    await auditLog(r.hidden ? "UNHIDE_REVIEW" : "HIDE_REVIEW", "Review", r.id, `Рейтинг ${r.rating}`, user.id);
    if (r.executorId) await recalcExecutorStats(r.executorId).catch(() => {});
    load();
  };

  const shown = onlyHidden ? reviews.filter((r) => r.hidden) : reviews;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOnlyHidden(false)} className={`px-2.5 py-1 text-xs font-mono uppercase ${!onlyHidden ? "btn-ink" : "btn-outline-ink"}`}>Все ({reviews.length})</button>
        <button onClick={() => setOnlyHidden(true)} className={`px-2.5 py-1 text-xs font-mono uppercase ${onlyHidden ? "btn-ink" : "btn-outline-ink"}`}>Скрытые</button>
      </div>
      {loading ? <p className="font-body text-sm text-ink-faint">Загрузка…</p> : shown.length === 0 ? (
        <BlankSheet className="paper-sheet--pad text-center"><p className="font-body text-sm text-ink-faint">Нет отзывов.</p></BlankSheet>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <BlankSheet key={r.id} className={`paper-sheet--pad ${r.hidden ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="stamp stamp-amber px-2 py-0.5 text-[11px] font-mono">{r.rating}/5</span>
                <span className="font-heading font-bold text-sm">{executors[r.executorId] || "—"}</span>
                <span className="font-mono text-[11px] text-ink-faint">{fmt(r.created_date)}</span>
                {r.hidden && <span className="font-mono text-[10px] text-[hsl(var(--stamp-red))] uppercase">скрыт</span>}
              </div>
              {r.comment && <p className="font-body text-sm mt-1">{r.comment}</p>}
              <button onClick={() => toggle(r)} className="btn-outline-ink px-3 py-1.5 text-xs mt-2">{r.hidden ? "Показать" : "Скрыть"}</button>
            </BlankSheet>
          ))}
        </div>
      )}
    </div>
  );
}