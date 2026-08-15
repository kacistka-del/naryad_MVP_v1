const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import BlankSheet from "@/components/BlankSheet";

function fmt(d) { return new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

export default function AdminAudit() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const l = await db.entities.AdminAuditLog.list("-created_date", 200);
        setList(l);
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      {loading ? <p className="font-body text-sm text-ink-faint">Загрузка…</p> : list.length === 0 ? (
        <BlankSheet className="paper-sheet--pad text-center"><p className="font-body text-sm text-ink-faint">Записей пока нет.</p></BlankSheet>
      ) : (
        <div className="space-y-1.5">
          {list.map((a) => (
            <BlankSheet key={a.id} className="paper-sheet--pad">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="stamp stamp-blue px-2 py-0.5 text-[11px] font-mono uppercase">{a.action}</span>
                <span className="font-mono text-[11px] text-ink-faint">{a.entity}{a.entityId ? " · " + a.entityId.slice(-6) : ""}</span>
                <span className="font-mono text-[11px] text-ink-faint ml-auto">{fmt(a.created_date)}</span>
              </div>
              {a.details && <p className="font-body text-sm mt-1">{a.details}</p>}
            </BlankSheet>
          ))}
        </div>
      )}
    </div>
  );
}