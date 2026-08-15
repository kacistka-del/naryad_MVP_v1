import React from "react";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";

export default function Board() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-4 border-b border-[hsl(var(--line))] pb-2">
          <h1 className="blank-title text-xl font-bold">Биржа</h1>
          <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">внешние объявления · из разрешённых источников</div>
        </div>
        <BlankSheet className="paper-sheet--pad text-center py-12">
          <div className="font-heading uppercase tracking-wider text-sm text-ink-faint">Лента объявлений будет здесь</div>
          <p className="font-body text-sm text-ink-faint mt-2 max-w-md mx-auto">
            Биржа публикует внешние объявления из легально разрешённых RSS/JSON-источников
            после модерации. Каждое объявление маркируется «с биржи» и ведёт на первоисточник.
          </p>
        </BlankSheet>
      </main>
    </div>
  );
}