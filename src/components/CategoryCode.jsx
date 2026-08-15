import React from "react";

export default function CategoryCode({ code, name }) {
  return (
    <span className="cat-code inline-flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-wider">
      <span className="cat-code__box">{code}</span>
      {name && <span className="text-ink-faint normal-case font-body">{name}</span>}
    </span>
  );
}