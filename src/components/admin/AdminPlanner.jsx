const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import BlankSheet from "@/components/BlankSheet";

export default function AdminPlanner() {
  const [settings, setSettings] = useState({});
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const list = await db.entities.SystemSetting.list();
      const map = {};
      list.forEach((s) => { map[s.key] = s.valueNumber !== undefined && s.valueNumber !== null ? s.valueNumber : s.value; });
      setSettings(map);
    } catch (e) {}
  };

  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true); setErr(""); setResult(null);
    try {
      const res = await db.functions.invoke("runPlanner", {});
      setResult(res.data);
    } catch (e) { setErr(e.message || "Планировщик недоступен"); }
    setRunning(false);
  };

  const Row = ({ label, value }) => (
    <div className="flex justify-between border-b border-[hsl(var(--line))] py-1.5">
      <span className="font-body text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <BlankSheet className="paper-sheet--pad">
        <div className="font-heading uppercase tracking-wider text-sm mb-2 border-b border-[hsl(var(--line))] pb-1">Уровень автономности</div>
        <Row label="Текущий уровень" value={settings.autonomyLevel || "L1"} />
        <Row label="Таймаут NEW" value={(settings.timeoutNewHours || 4) + " ч"} />
        <Row label="Таймаут ASSIGNED" value={(settings.timeoutAssignedHours || 24) + " ч"} />
        <Row label="Таймаут AWAITING" value={(settings.timeoutAwaitingConfirmHours || 72) + " ч"} />
        <Row label="Повтор поиска" value={(settings.searchRetryMinutes || 30) + " мин"} />
        <p className="font-body text-xs text-ink-faint mt-2">
          L1 — только фиксация SLA. L2 — автозавершение и возврат в поиск. L3 — автопроверка новых заявок.
          Автоматический запуск — каждые 5 мин (требует Builder+).
        </p>
      </BlankSheet>

      <BlankSheet className="paper-sheet--pad">
        <div className="font-heading uppercase tracking-wider text-sm mb-2 border-b border-[hsl(var(--line))] pb-1">Ручной запуск</div>
        <button onClick={run} disabled={running} className="btn-ink px-4 py-2 text-xs">{running ? "Выполняется…" : "Запустить планировщик"}</button>
        {err && <p className="text-sm text-[hsl(var(--stamp-red))] mt-2">{err}</p>}
        {result && (
          <div className="mt-3">
            <Row label="SLA отмечено" value={result.results?.flagged} />
            <Row label="Автозавершено" value={result.results?.autoCompleted} />
            <Row label="Возврат в поиск" value={result.results?.reassigned} />
            <Row label="Автопроверка" value={result.results?.autoReviewed} />
          </div>
        )}
      </BlankSheet>
    </div>
  );
}