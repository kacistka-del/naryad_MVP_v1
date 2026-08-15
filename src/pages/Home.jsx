const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";
import CategoryCode from "@/components/CategoryCode";

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState([]);
  const [executors, setExecutors] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const cats = await db.entities.Category.filter({ isArchived: false });
        setCategories(cats);
      } catch (e) {}
      try {
        const ex = await db.entities.Executor.filter({ moderationStatus: "APPROVED", isActive: true }, "-ratingAvg", 6);
        setExecutors(ex);
      } catch (e) {}
    })();
  }, []);

  const goOrder = () => {
    navigate("/orders/new", { state: { description } });
  };

  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <BlankSheet className="paper-sheet--pad mb-6">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[hsl(var(--line))] pb-3 mb-4">
            <div>
              <div className="blank-title text-2xl font-bold">НАРЯД</div>
              <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">
                бланк заказа работ · форма №1
              </div>
            </div>
            <div className="font-mono text-xs text-ink-faint text-right">
              <div>Дата: {today}</div>
              <div>№ ____________</div>
            </div>
          </div>

          <label className="block">
            <span className="font-heading uppercase tracking-wider text-sm">Содержание работ</span>
            <p className="font-body text-sm text-ink-faint mt-0.5 mb-2">
              Опишите задачу обычными словами — не нужно знать нужную специализацию. Координатор подберёт исполнителя.
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Например: нужно установить кондиционер в спальне, стена кирпичная"
              className="field-underline w-full text-lg py-1.5"
            />
          </label>

          <div className="flex flex-wrap gap-3 mt-5">
            <button onClick={goOrder} className="btn-ink px-5 py-2.5 text-sm">
              Оформить наряд
            </button>
            <span className="font-body text-sm text-ink-faint self-center">
              дальше — проверка координатором и подбор исполнителя
            </span>
          </div>
        </BlankSheet>

        <section className="mb-8">
          <h2 className="font-heading uppercase tracking-wider text-sm mb-3 border-b border-[hsl(var(--line))] pb-1">
            Категории работ
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate("/orders/new", { state: { categoryCode: c.code, description } })}
                className="paper-sheet paper-sheet--pad text-left hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <CategoryCode code={c.code} />
                <div className="font-body text-sm mt-1">{c.name}</div>
              </button>
            ))}
          </div>
        </section>

        {executors.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-3 border-b border-[hsl(var(--line))] pb-1">
              <h2 className="font-heading uppercase tracking-wider text-sm">Исполнители</h2>
              <Link to="/executors" className="link-ink text-sm font-body">
                весь каталог →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {executors.map((ex) => (
                <div key={ex.id} className="paper-sheet paper-sheet--pad">
                  <div className="font-heading font-bold">{ex.fullName || "Исполнитель"}</div>
                  <div className="font-mono text-[11px] text-ink-faint uppercase mt-0.5">
                    {ex.city || "—"} · рейтинг {(ex.ratingAvg || 0).toFixed(1)} · {ex.ordersCount || 0} заказов
                  </div>
                  {ex.specialties?.length > 0 && (
                    <div className="font-body text-sm mt-1">{ex.specialties.join(" · ")}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer className="max-w-6xl mx-auto px-4 py-6 font-mono text-[11px] text-ink-faint uppercase tracking-wider">
        НАРЯД · координируемый маркетплейс услуг · {new Date().getFullYear()}
      </footer>
    </div>
  );
}