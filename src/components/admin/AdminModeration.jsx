const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import BlankSheet from "@/components/BlankSheet";

import { auditLog } from "@/lib/orderActions";

export default function AdminModeration() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("PENDING");

  const load = async () => {
    setLoading(true);
    try {
      const all = await db.entities.Executor.list("-created_date", 200);
      setList(all);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const shown = filter === "ALL" ? list : list.filter((e) => e.moderationStatus === filter);

  const setStatus = async (ex, status) => {
    await db.entities.Executor.update(ex.id, { moderationStatus: status });
    await auditLog(status === "APPROVED" ? "APPROVE_EXECUTOR" : "REJECT_EXECUTOR", "Executor", ex.id, `${ex.fullName} → ${status}`, user.id);
    if (ex.userId) await db.entities.Notification.create({ userId: ex.userId, type: "MODERATION", text: "Профиль " + (status === "APPROVED" ? "одобрен" : "отклонён") }).catch(() => {});
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {["PENDING", "DRAFT", "REJECTED", "APPROVED", "ALL"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 text-xs font-mono uppercase ${filter === f ? "btn-ink" : "btn-outline-ink"}`}>{f}</button>
        ))}
      </div>
      {loading ? <p className="font-body text-sm text-ink-faint">Загрузка…</p> : shown.length === 0 ? (
        <BlankSheet className="paper-sheet--pad text-center"><p className="font-body text-sm text-ink-faint">Нет профилей.</p></BlankSheet>
      ) : (
        <div className="space-y-2">
          {shown.map((ex) => (
            <BlankSheet key={ex.id} className="paper-sheet--pad">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-heading font-bold">{ex.fullName || "—"}</span>
                <span className="font-mono text-[11px] text-ink-faint uppercase">{ex.moderationStatus}</span>
                <span className="font-mono text-[11px] text-ink-faint">{ex.city}</span>
                <span className="font-mono text-[11px] text-ink-faint">{(ex.categoryCodes || []).join(" ")}</span>
              </div>
              {ex.description && <p className="font-body text-sm mt-1 line-clamp-2">{ex.description}</p>}
              {(ex.specialties || []).length > 0 && <p className="font-mono text-[11px] text-ink-faint mt-1">{ex.specialties.join(", ")}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => setStatus(ex, "APPROVED")} className="btn-ink px-3 py-1.5 text-xs">Одобрить</button>
                <button onClick={() => setStatus(ex, "REJECTED")} className="btn-outline-ink px-3 py-1.5 text-xs">Отклонить</button>
              </div>
            </BlankSheet>
          ))}
        </div>
      )}
    </div>
  );
}