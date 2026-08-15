const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";
import StatusStamp from "@/components/StatusStamp";

function fmtDate(d) { return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }); }

export default function ExecutorCabinet() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const list = await db.entities.Executor.filter({ userId: user.id });
      const p = list[0] || null;
      setProfile(p);
      if (p) {
        const ords = await db.entities.Order.filter({ executorId: user.id }, "-created_date", 100);
        setOrders(ords);
      }
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="min-h-screen"><Header /><main className="max-w-4xl mx-auto px-4 py-8"><p className="font-body text-sm text-ink-faint">Загрузка…</p></main></div>;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-4 border-b border-[hsl(var(--line))] pb-2">
          <h1 className="blank-title text-xl font-bold">Кабинет исполнителя</h1>
          <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">{user?.full_name}</div>
        </div>

        {!profile ? (
          <BlankSheet className="paper-sheet--pad">
            <p className="font-body text-sm">Профиль исполнителя не найден. Обратитесь к администратору.</p>
          </BlankSheet>
        ) : (
          <>
            <BlankSheet className="paper-sheet--pad mb-4">
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 font-body text-sm">
                <div><div className="font-heading uppercase tracking-wider text-[11px] text-ink-faint">Статус модерации</div><div className="font-mono">{profile.moderationStatus}</div></div>
                <div><div className="font-heading uppercase tracking-wider text-[11px] text-ink-faint">Активность</div><div className="font-mono">{profile.isActive ? "работаю" : "в отпуске"}</div></div>
                <div><div className="font-heading uppercase tracking-wider text-[11px] text-ink-faint">Рейтинг</div><div className="font-mono">{(profile.ratingAvg || 0).toFixed(1)}</div></div>
                <div><div className="font-heading uppercase tracking-wider text-[11px] text-ink-faint">Отказов</div><div className="font-mono">{((profile.cancelRate || 0) * 100).toFixed(0)}%</div></div>
              </div>
              <div className="mt-3 pt-3 border-t border-[hsl(var(--line))] flex gap-2">
                <Link to="/executor/profile" className="btn-outline-ink px-4 py-2 text-xs">Редактировать профиль</Link>
              </div>
            </BlankSheet>

            <div className="mb-2 font-heading uppercase tracking-wider text-sm border-b border-[hsl(var(--line))] pb-1">Назначенные наряды</div>
            {orders.length === 0 ? (
              <BlankSheet className="paper-sheet--pad text-center"><p className="font-body text-sm text-ink-faint">Назначений пока нет.</p></BlankSheet>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <Link key={o.id} to={`/orders/${o.id}`} className="block paper-sheet paper-sheet--pad hover:bg-[hsl(var(--muted))]">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold">{o.orderNumber}</span>
                      <StatusStamp status={o.status} size="sm" rotate={false} />
                      <span className="font-mono text-[11px] text-ink-faint">{fmtDate(o.created_date)}</span>
                      <span className="font-mono text-[11px] text-ink-faint">{o.city}</span>
                    </div>
                    <p className="font-body text-sm mt-1 line-clamp-1">{o.description}</p>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}