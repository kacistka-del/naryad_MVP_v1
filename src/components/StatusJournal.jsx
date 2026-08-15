import React from "react";
import StatusStamp from "./StatusStamp";
import { roleLabel } from "@/lib/orders";

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StatusJournal({ entries = [] }) {
  if (!entries.length) {
    return <p className="text-sm text-ink-faint font-body">Журнал пуст.</p>;
  }
  const sorted = [...entries].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  return (
    <ol className="journal">
      {sorted.map((e, i) => (
        <li key={e.id || i} className="journal__row">
          <div className="journal__dot" />
          <div className="journal__body">
            <div className="flex flex-wrap items-center gap-2">
              <StatusStamp status={e.status} size="sm" rotate={false} />
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                {roleLabel(e.authorRole)}
              </span>
            </div>
            <div className="font-mono text-[11px] text-ink-faint mt-0.5">
              {fmtDate(e.created_date)}
            </div>
            {e.comment && (
              <p className="font-body text-sm text-ink mt-1 leading-snug">{e.comment}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}