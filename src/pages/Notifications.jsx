const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";

function fmt(d) { return new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const list = await db.entities.Notification.filter({ userId: user.id }, "-created_date", 50);
      setItems(list);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markAll = async () => {
    await db.entities.Notification.updateMany({ userId: user.id, read: false }, { $set: { read: true } });
    load();
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-4 border-b border-[hsl(var(--line))] pb-2 flex items-end justify-between">
          <h1 className="blank-title text-xl font-bold">Уведомления</h1>
          <button onClick={markAll} className="btn-outline-ink px-3 py-1.5 text-xs">Отметить прочитанными</button>
        </div>
        {loading ? <p className="font-body text-sm text-ink-faint">Загрузка…</p> : items.length === 0 ? (
          <BlankSheet className="paper-sheet--pad text-center"><p className="font-body text-sm text-ink-faint">Нет уведомлений.</p></BlankSheet>
        ) : (
          <div className="space-y-1.5">
            {items.map((n) => (
              <div key={n.id} className={`paper-sheet paper-sheet--pad ${n.read ? "opacity-60" : ""}`}>
                <div className="flex items-baseline gap-2">
                  {!n.read && <span className="w-2 h-2 bg-[hsl(var(--stamp-blue))] rounded-full" />}
                  <span className="font-body text-sm">{n.text}</span>
                </div>
                <div className="font-mono text-[11px] text-ink-faint mt-0.5">{fmt(n.created_date)} · {n.type}</div>
                {n.relatedOrderId && <Link to={`/orders/${n.relatedOrderId}`} className="link-ink text-xs font-body">к наряду →</Link>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}