const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";
import CategoryCode from "@/components/CategoryCode";

export default function ExecutorCatalog() {
  const [executors, setExecutors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await db.entities.Executor.filter({ moderationStatus: "APPROVED", isActive: true }, "-ratingAvg", 100);
        setExecutors(list);
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-4 border-b border-[hsl(var(--line))] pb-2">
          <h1 className="blank-title text-xl font-bold">Каталог исполнителей</h1>
          <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">проверенные профили · для доверия</div>
        </div>
        <p className="font-body text-sm text-ink-faint mb-4">
          Каталог — для знакомства. Заказ оформляется через наряд, а исполнителя подбирает координатор.
        </p>

        {loading ? (
          <p className="font-body text-sm text-ink-faint">Загрузка…</p>
        ) : executors.length === 0 ? (
          <BlankSheet className="paper-sheet--pad text-center"><p className="font-body text-sm text-ink-faint">Пока нет проверенных исполнителей.</p></BlankSheet>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {executors.map((ex) => (
              <BlankSheet key={ex.id} className="paper-sheet--pad">
                <div className="flex items-baseline justify-between">
                  <div className="font-heading font-bold">{ex.fullName || "Исполнитель"}</div>
                  {ex.isSeed && <span className="font-mono text-[10px] text-ink-faint uppercase">стартовый</span>}
                </div>
                <div className="font-mono text-[11px] text-ink-faint uppercase mt-0.5">
                  {ex.city || "—"} · рейтинг {(ex.ratingAvg || 0).toFixed(1)} · {ex.ordersCount || 0} зак.
                </div>
                {ex.description && <p className="font-body text-sm mt-2 line-clamp-3">{ex.description}</p>}
                {ex.specialties?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ex.specialties.slice(0, 4).map((s, i) => <span key={i} className="font-mono text-[10px] uppercase border border-[hsl(var(--ink))] px-1">{s}</span>)}
                  </div>
                )}
                {ex.categoryCodes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ex.categoryCodes.slice(0, 5).map((c) => <CategoryCode key={c} code={c} />)}
                  </div>
                )}
              </BlankSheet>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}