const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";
import CategoryCode from "@/components/CategoryCode";

import { makeOrderNumber } from "@/lib/orders";

export default function OrderNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const preset = location.state || {};

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    description: preset.description || "",
    categoryCode: preset.categoryCode || "",
    city: "",
    budget: "",
    desiredDate: "",
    address: "",
    contactName: user?.full_name || "",
    contactPhone: user?.data?.phone || "",
  });
  const [suggestion, setSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    db.entities.Category.filter({ isArchived: false }).then(setCategories).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const runAi = async () => {
    if (form.description.trim().length < 5) {
      setAiError("Опишите задачу подробнее (минимум 5 символов).");
      return;
    }
    setAiLoading(true);
    setAiError("");
    setSuggestion(null);
    try {
      const res = await db.functions.invoke("structureOrder", { description: form.description });
      setSuggestion(res.data?.suggestion || null);
    } catch (e) {
      setAiError(e.message || "AI-подсказка недоступна");
    } finally {
      setAiLoading(false);
    }
  };

  const applyCategory = (code) => setForm((f) => ({ ...f, categoryCode: code }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.description || !form.categoryCode || !form.city || !form.contactName || !form.contactPhone) {
      setError("Заполните обязательные поля: описание, категория, город, контакт, телефон.");
      return;
    }
    setSubmitting(true);
    try {
      const orderNumber = makeOrderNumber(Date.now() % 1000000);
      const created = await db.entities.Order.create({
        orderNumber,
        description: form.description,
        categoryCode: form.categoryCode,
        city: form.city,
        budget: form.budget ? Number(form.budget) : null,
        desiredDate: form.desiredDate || null,
        address: form.address || null,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        status: "NEW",
        clientId: user.id,
        autoCompleted: false,
      });
      await db.entities.OrderStatusHistory.create({
        orderId: created.id,
        status: "NEW",
        authorRole: "CLIENT",
        authorId: user.id,
        comment: "Наряд оформлен клиентом",
      });
      navigate(`/orders/${created.id}`);
    } catch (e) {
      setError(e.message || "Не удалось создать наряд");
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <BlankSheet className="paper-sheet--pad">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[hsl(var(--line))] pb-3 mb-5">
            <div>
              <div className="blank-title text-xl font-bold">Новый наряд</div>
              <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">форма №1 · создание</div>
            </div>
            <div className="font-mono text-xs text-ink-faint">Дата: {today}</div>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="font-heading uppercase tracking-wider text-sm">Содержание работ *</label>
              <textarea
                value={form.description}
                onChange={set("description")}
                rows={3}
                className="field-underline w-full mt-1 py-1.5"
                placeholder="Опишите задачу обычными словами"
              />
              <div className="mt-2 flex items-center gap-3">
                <button type="button" onClick={runAi} disabled={aiLoading} className="btn-outline-ink px-3 py-1.5 text-xs">
                  {aiLoading ? "Анализ…" : "Предложить детали (AI)"}
                </button>
                <span className="font-body text-xs text-ink-faint">
                  AI только предлагает — решение всегда за вами
                </span>
              </div>
              {aiError && <p className="text-sm text-[hsl(var(--stamp-red))] mt-1">{aiError}</p>}
            </div>

            {suggestion && (
              <div className="paper-sheet paper-sheet--pad bg-[hsl(var(--muted)/0.4)]">
                <div className="font-heading uppercase tracking-wider text-xs mb-2">AI-подсказка</div>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 font-body text-sm">
                  <div>Категория: <button type="button" onClick={() => applyCategory(suggestion.categoryId)} className="link-ink font-mono">{suggestion.categoryId}</button></div>
                  <div>Сложность: <span className="font-mono">{suggestion.estimatedComplexity}</span></div>
                  <div>Ориентир цены: <span className="font-mono">{suggestion.estimatedCost?.min}–{suggestion.estimatedCost?.max} ₽</span></div>
                  <div>Срок: <span className="font-mono">{suggestion.estimatedDurationDays} дн.</span></div>
                </div>
                {suggestion.specialties?.length > 0 && (
                  <div className="font-body text-sm mt-2">Специализации: {suggestion.specialties.join(", ")}</div>
                )}
                {suggestion.clarifyingQuestions?.length > 0 && (
                  <div className="mt-2">
                    <div className="font-body text-sm font-bold">Уточняющие вопросы:</div>
                    <ul className="list-disc list-inside font-body text-sm">
                      {suggestion.clarifyingQuestions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </div>
                )}
                <div className="font-mono text-[11px] text-ink-faint mt-2">confidence: {suggestion.confidence}</div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="font-heading uppercase tracking-wider text-sm">Категория *</label>
                <select value={form.categoryCode} onChange={set("categoryCode")} className="field-underline w-full mt-1 py-1.5">
                  <option value="">— выберите —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-heading uppercase tracking-wider text-sm">Город *</label>
                <input value={form.city} onChange={set("city")} className="field-underline w-full mt-1 py-1.5" placeholder="Москва" />
              </div>
              <div>
                <label className="font-heading uppercase tracking-wider text-sm">Бюджет, ₽</label>
                <input type="number" value={form.budget} onChange={set("budget")} className="field-underline w-full mt-1 py-1.5" placeholder="необязательно" />
              </div>
              <div>
                <label className="font-heading uppercase tracking-wider text-sm">Желаемый срок</label>
                <input type="date" value={form.desiredDate} onChange={set("desiredDate")} className="field-underline w-full mt-1 py-1.5" />
              </div>
              <div className="sm:col-span-2">
                <label className="font-heading uppercase tracking-wider text-sm">Адрес выполнения</label>
                <input value={form.address} onChange={set("address")} className="field-underline w-full mt-1 py-1.5" placeholder="необязательно" />
              </div>
              <div>
                <label className="font-heading uppercase tracking-wider text-sm">Контактное лицо *</label>
                <input value={form.contactName} onChange={set("contactName")} className="field-underline w-full mt-1 py-1.5" />
              </div>
              <div>
                <label className="font-heading uppercase tracking-wider text-sm">Телефон *</label>
                <input value={form.contactPhone} onChange={set("contactPhone")} className="field-underline w-full mt-1 py-1.5" placeholder="+7 ..." />
              </div>
            </div>

            {error && <p className="text-sm text-[hsl(var(--stamp-red))]">{error}</p>}

            <div className="flex gap-3 pt-2 border-t border-[hsl(var(--line))]">
              <button type="submit" disabled={submitting} className="btn-ink px-5 py-2.5 text-sm">
                {submitting ? "Оформляем…" : "Оформить наряд"}
              </button>
              <button type="button" onClick={() => navigate("/")} className="btn-outline-ink px-4 py-2.5 text-sm">
                Отмена
              </button>
            </div>
          </form>
        </BlankSheet>
      </main>
    </div>
  );
}