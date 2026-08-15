import React, { useState } from "react";
import Header from "@/components/Header";
import AdminQueue from "@/components/admin/AdminQueue";
import AdminModeration from "@/components/admin/AdminModeration";
import AdminReviews from "@/components/admin/AdminReviews";
import AdminStats from "@/components/admin/AdminStats";
import AdminPlanner from "@/components/admin/AdminPlanner";
import AdminAudit from "@/components/admin/AdminAudit";

const TABS = [
  { key: "queue", label: "Очередь" },
  { key: "moderation", label: "Модерация" },
  { key: "reviews", label: "Отзывы" },
  { key: "stats", label: "Статистика" },
  { key: "planner", label: "Планировщик" },
  { key: "audit", label: "Аудит" },
];

export default function AdminPanel() {
  const [tab, setTab] = useState("queue");

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-4 border-b border-[hsl(var(--line))] pb-2">
          <h1 className="blank-title text-xl font-bold">Админ · координация</h1>
          <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">очередь · модерация · экономика · автопилот</div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs font-heading uppercase tracking-wider ${tab === t.key ? "btn-ink" : "btn-outline-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "queue" && <AdminQueue />}
        {tab === "moderation" && <AdminModeration />}
        {tab === "reviews" && <AdminReviews />}
        {tab === "stats" && <AdminStats />}
        {tab === "planner" && <AdminPlanner />}
        {tab === "audit" && <AdminAudit />}
      </main>
    </div>
  );
}