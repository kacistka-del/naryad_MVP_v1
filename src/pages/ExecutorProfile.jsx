const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";

export default function ExecutorProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ description: "", specialties: "", city: "", contacts: "", categoryCodes: [] });
  const [reviews, setReviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const cats = await db.entities.Category.filter({ isArchived: false });
      setCategories(cats);
      const list = await db.entities.Executor.filter({ userId: user.id });
      const p = list[0];
      setProfile(p);
      if (p) setForm({
        description: p.description || "",
        specialties: (p.specialties || []).join(", "),
        city: p.city || "",
        contacts: p.contacts || "",
        categoryCodes: p.categoryCodes || [],
      });
      try {
        const rv = await db.entities.Review.filter({ executorId: user.id, hidden: false }, "-created_date", 10);
        setReviews(rv);
      } catch (e) {}
    })();
  }, []);

  const toggleCat = (code) => setForm((f) => ({
    ...f,
    categoryCodes: f.categoryCodes.includes(code) ? f.categoryCodes.filter((c) => c !== code) : [...f.categoryCodes, code],
  }));

  const save = async (submitForReview) => {
    setSaving(true); setMsg("");
    try {
      const data = {
        description: form.description,
        specialties: form.specialties.split(",").map((s) => s.trim()).filter(Boolean),
        city: form.city,
        contacts: form.contacts,
        categoryCodes: form.categoryCodes,
        moderationStatus: submitForReview ? "PENDING" : (profile?.moderationStatus || "DRAFT"),
      };
      if (profile) await db.entities.Executor.update(profile.id, data);
      else await db.entities.Executor.create({ userId: user.id, fullName: user.full_name, isActive: true, ...data });
      setMsg(submitForReview ? "Профиль отправлен на модерацию." : "Профиль сохранён.");
      navigate("/executor");
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-4 border-b border-[hsl(var(--line))] pb-2">
          <h1 className="blank-title text-xl font-bold">Профиль исполнителя</h1>
          <div className="font-mono text-[11px] text-ink-faint uppercase tracking-wider">статус: {profile?.moderationStatus || "DRAFT"}</div>
        </div>
        <BlankSheet className="paper-sheet--pad space-y-4">
          <div>
            <label className="font-heading uppercase tracking-wider text-sm">Описание</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="field-underline w-full mt-1 py-1.5" placeholder="Опишите опыт и услуги" />
          </div>
          <div>
            <label className="font-heading uppercase tracking-wider text-sm">Специализации (через запятую)</label>
            <input value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} className="field-underline w-full mt-1 py-1.5" placeholder="кондиционеры, монтаж, заправка" />
          </div>
          <div>
            <label className="font-heading uppercase tracking-wider text-sm">Город</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="field-underline w-full mt-1 py-1.5" />
          </div>
          <div>
            <label className="font-heading uppercase tracking-wider text-sm">Контакты</label>
            <input value={form.contacts} onChange={(e) => setForm({ ...form, contacts: e.target.value })} className="field-underline w-full mt-1 py-1.5" placeholder="сайт / мессенджер" />
          </div>
          <div>
            <label className="font-heading uppercase tracking-wider text-sm">Категории</label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {categories.map((c) => (
                <button key={c.id} type="button" onClick={() => toggleCat(c.code)}
                  className={`px-2 py-1 font-mono text-xs uppercase border ${form.categoryCodes.includes(c.code) ? "btn-ink" : "btn-outline-ink"}`}>
                  {c.code}
                </button>
              ))}
            </div>
          </div>
          {msg && <p className="text-sm text-[hsl(var(--stamp-green))]">{msg}</p>}
          <div className="flex gap-2 pt-2 border-t border-[hsl(var(--line))]">
            <button disabled={saving} onClick={() => save(false)} className="btn-outline-ink px-4 py-2 text-xs">Сохранить</button>
            <button disabled={saving} onClick={() => save(true)} className="btn-ink px-4 py-2 text-xs">Отправить на проверку</button>
          </div>
        </BlankSheet>

        {reviews.length > 0 && (
          <div className="mt-6">
            <div className="font-heading uppercase tracking-wider text-sm mb-2 border-b border-[hsl(var(--line))] pb-1">Отзывы клиентов</div>
            <div className="space-y-1.5">
              {reviews.map((r) => (
                <BlankSheet key={r.id} className="paper-sheet--pad">
                  <div className="flex items-baseline gap-2">
                    <span className="stamp stamp-amber px-2 py-0.5 text-[11px] font-mono">{r.rating}/5</span>
                    <span className="font-mono text-[11px] text-ink-faint">{new Date(r.created_date).toLocaleDateString("ru-RU")}</span>
                  </div>
                  {r.comment && <p className="font-body text-sm mt-1">{r.comment}</p>}
                </BlankSheet>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}