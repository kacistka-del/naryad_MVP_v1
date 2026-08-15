import React from "react";
import { statusLabel, statusTone } from "@/lib/orders";

const TONE_CLASS = {
  blue: "stamp-blue",
  amber: "stamp-amber",
  green: "stamp-green",
  red: "stamp-red",
};

export default function StatusStamp({ status, size = "md", rotate = true }) {
  const tone = statusTone(status);
  const toneClass = TONE_CLASS[tone] || TONE_CLASS.amber;
  const sizeClass = size === "lg" ? "px-4 py-2 text-base" : "px-2.5 py-1 text-[11px]";
  const rot = rotate ? "stamp-tilt" : "";
  return (
    <span
      className={`stamp ${toneClass} ${sizeClass} ${rot} inline-flex items-center font-mono font-bold uppercase tracking-wider`}
    >
      {statusLabel(status)}
    </span>
  );
}