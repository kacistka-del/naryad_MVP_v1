const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Header from "@/components/Header";
import BlankSheet from "@/components/BlankSheet";
import StatusStamp from "@/components/StatusStamp";
import StatusJournal from "@/components/StatusJournal";

import { rankCandidates, detectContactExchange, transitionOrder, submitReview } from "@/lib/orderActions";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [executor, setExecutor] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [chatText, setChatText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [needsInfoComment, setNeedsInfoComment] = useState("");
  const [disputeComment, setDisputeComment] = useState("");
  const [reviews, setReviews] = useState([]);
  const [myReview, setMyReview] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const chatRef = useRef(null);

  const load = async () => {
    try {
      const o = await db.entities.Order.get(id);
      setOrder(o);
      if (o.executorId) {
        try {
          const ex = await db.entities.Executor.filter({ userId: o.executorId });
          setExecutor(ex[0] || null);
        } catch (e) {}
      }
      const h = await db.entities.OrderStatusHistory.filter({ orderId: id });
      setHistory(h);
      const m = await db.entities.Message.filter({ orderId: id });
      setMessages(m.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
      try {
        const rv = await db.entities.Review.filter({ orderId: id });
        setReviews(rv);
        setMyReview(rv.find((r) => r.clientId === user.id) || null);
      } catch (e2) {}
    } catch (e) {
      setError(e.message || "Заказ не найден");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => {
      db.entities.Message.filter({ orderId: id }).then((m) => {
        setMessages(m.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages]);

  if (loading) return <div className="min-h-screen"><Header /><main className="max-w-4xl mx-auto px-4 py-8"><p className="font-body text-sm text-ink-faint">Загрузка…</p></main></div>;
  if (error) return <div className="min-h-screen"><Header /><main className="max-w-4xl mx-auto px-4 py-8"><p className="text-sm text-[hsl(var(--stamp-red))]">{error}</p></main></div>;
  if (!order) return null;

  const role = user.role === "admin" ? "ADMIN" : order.clientId === user.id ? "CLIENT" : order.executorId === user.id ? "EXECUTOR" : null;
  if (!role) {
    return <div className="min-h-screen"><Header /><main className="max-w-4xl mx-auto px-4 py-8"><p className="text-sm text-[hsl(var(--stamp-red))]">Заказ не найден.</p></main></div>;
  }

  const reload = async () => { setLoading(true); await load(); };

  const act = async (fn) => {
    setBusy(true); setActionError("");
    try { await fn(); await reload(); } catch (e) { setActionError(e.message || "Действие недоступно"); } finally { setBusy(false); }
  };

  const send = async () => {
    if (!chatText.trim()) return;
    const text = chatText.trim();
    setChatText("");
    const participants = [order.clientId, order.executorId].filter(Boolean);
    const suspected = detectContactExchange(text);
    try {
      await db.entities.Message.create({
        orderId: id,
        senderId: user.id,
        senderRole: role,
        text,
        contactExchangeSuspected: suspected,
        systemMessage: false,
        participants,
      });
      await load();
    } catch (e) { setActionError(e.message); }
  };

  const loadCandidates = async () => {
    const ex = await db.entities.Executor.filter({ moderationStatus: "APPROVED", isActive: true });
    const matched = ex.filter((e) => !order.categoryCode || (e.categoryCodes || []).includes(order.categoryCode));
    setCandidates(rankCandidates(matched.length ? matched : ex));
  };

  const assign = (ex) => act(async () => {
    await transitionOrder(order, "ASSIGNED", {
      comment: `Назначен исполнитель: ${ex.fullName || ex.id}`,
      patch: { executorId: ex.userId },
    });
  });

  const submitReviewHandler = () =>
    act(async () => {
      await submitReview(order, order.executorId, user.id, reviewRating, reviewComment);
    });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-3">
          <Link to={role === "CLIENT" ? "/client" : role === "EXECUTOR" ? "/executor" : "/admin"} className="link-ink text-sm font-body">← к списку</Link>
        </div>

        <BlankSheet className="paper-sheet--pad mb-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[hsl(var(--line))] pb-3 mb-4">
            <div>
              <div className="font-mono text-xs text-ink-faint uppercase tracking-wider">Наряд</div>
              <div className="blank-title text-2xl font-bold">{order.orderNumber}</div>
            </div>
            <div className="text-right">
              <StatusStamp status={order.status} size="lg" />
              <div className="font-mono text-[11px] text-ink-faint mt-1">создан {fmtDate(order.created_date)}</div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 font-body text-sm">
            <Field label="Категория" value={order.categoryCode} />
            <Field label="Город" value={order.city} />
            <Field label="Бюджет" value={order.budget ? order.budget + " ₽" : "—"} />
            <Field label="Срок" value={order.desiredDate || "—"} />
            <Field label="Адрес" value={order.address || "—"} />
            <Field label="Финальная цена" value={order.finalPrice ? order.finalPrice + " ₽" : "—"} />
            <Field label="Клиент" value={order.contactName} />
            <Field label="Телефон" value={order.contactPhone} />
            <Field label="Исполнитель" value={executor?.fullName || (order.executorId ? "—" : "не назначен")} />
          </div>

          <div className="mt-4 pt-3 border-t border-[hsl(var(--line))]">
            <div className="font-heading uppercase tracking-wider text-xs text-ink-faint mb-1">Содержание работ</div>
            <p className="font-body text-base leading-relaxed">{order.description}</p>
          </div>

          {order.cancelReason && (
            <div className="mt-3 paper-sheet paper-sheet--pad" style={{ borderColor: "hsl(var(--stamp-red))" }}>
              <div className="font-heading uppercase tracking-wider text-xs text-[hsl(var(--stamp-red))]">Отмена</div>
              <p className="font-body text-sm mt-1">{order.cancelReason} <span className="font-mono text-[11px] text-ink-faint">({order.cancelledByRole})</span></p>
            </div>
          )}
        </BlankSheet>

        {/* Действия по ролям */}
        <BlankSheet className="paper-sheet--pad mb-4">
          <div className="font-heading uppercase tracking-wider text-sm mb-3 border-b border-[hsl(var(--line))] pb-1">Действия</div>
          {actionError && <p className="text-sm text-[hsl(var(--stamp-red))] mb-2">{actionError}</p>}

          {role === "CLIENT" && (
            <div className="flex flex-wrap gap-2">
              {order.status === "AWAITINGCONFIRMATION" && (
                <button disabled={busy} onClick={() => act(() => transitionOrder(order, "COMPLETED", { authorRole: "CLIENT", comment: "Клиент подтвердил выполнение" }))} className="btn-ink px-4 py-2 text-xs">Подтвердить выполнение</button>
              )}
              {order.status === "AWAITINGCONFIRMATION" && (
                <button disabled={busy} onClick={() => act(() => transitionOrder(order, "DISPUTE", { authorRole: "CLIENT", comment: disputeComment || "Клиент оспорил сдачу", patch: {} }))} className="btn-outline-ink px-4 py-2 text-xs">Оспорить цену</button>
              )}
              {["NEW", "REVIEW", "NEEDSINFO", "SEARCHING", "ASSIGNED", "CONFIRMED", "INPROGRESS"].includes(order.status) && (
                <CancelBtn busy={busy} cancelReason={cancelReason} setCancelReason={setCancelReason} onConfirm={() => act(() => transitionOrder(order, "CANCELLED", { authorRole: "CLIENT", comment: cancelReason || "Отмена клиентом", patch: { cancelReason: cancelReason || "Отмена клиентом", cancelledByRole: "CLIENT" } }))} />
              )}
            </div>
          )}

          {role === "EXECUTOR" && (
            <div className="flex flex-wrap gap-2 items-center">
              {order.status === "ASSIGNED" && (
                <>
                  <button disabled={busy} onClick={() => act(() => transitionOrder(order, "CONFIRMED", { authorRole: "EXECUTOR", comment: "Исполнитель принял заказ" }))} className="btn-ink px-4 py-2 text-xs">Принять</button>
                  <button disabled={busy} onClick={() => act(() => transitionOrder(order, "SEARCHING", { authorRole: "EXECUTOR", comment: "Исполнитель отказался", patch: { executorId: null, assignedAt: null } }))} className="btn-outline-ink px-4 py-2 text-xs">Отказаться</button>
                </>
              )}
              {order.status === "CONFIRMED" && (
                <button disabled={busy} onClick={() => act(() => transitionOrder(order, "INPROGRESS", { authorRole: "EXECUTOR", comment: "Работа начата" }))} className="btn-ink px-4 py-2 text-xs">Начать работу</button>
              )}
              {order.status === "INPROGRESS" && (
                <>
                  <input type="number" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder="Финальная цена, ₽" className="field-underline px-1 py-1 text-sm w-40" />
                  <button disabled={busy} onClick={() => act(() => transitionOrder(order, "AWAITINGCONFIRMATION", { authorRole: "EXECUTOR", comment: "Запрошено подтверждение, цена " + finalPrice, patch: { finalPrice: finalPrice ? Number(finalPrice) : null } }))} className="btn-ink px-4 py-2 text-xs">Запросить подтверждение</button>
                </>
              )}
              {["CONFIRMED", "INPROGRESS", "AWAITINGCONFIRMATION"].includes(order.status) && (
                <button disabled={busy} onClick={() => act(() => transitionOrder(order, "DISPUTE", { authorRole: "EXECUTOR", comment: disputeComment || "Спор от исполнителя" }))} className="btn-outline-ink px-4 py-2 text-xs">Открыть спор</button>
              )}
            </div>
          )}

          {role === "ADMIN" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {order.status === "NEW" && (
                  <button disabled={busy} onClick={() => act(() => transitionOrder(order, "REVIEW", { authorRole: "ADMIN", comment: "Взята в проверку" }))} className="btn-ink px-4 py-2 text-xs">В проверку</button>
                )}
                {order.status === "REVIEW" && (
                  <>
                    <button disabled={busy} onClick={() => act(() => transitionOrder(order, "SEARCHING", { authorRole: "ADMIN", comment: "Заявка одобрена, поиск исполнителя" }))} className="btn-ink px-4 py-2 text-xs">Одобрить → в поиск</button>
                    <input value={needsInfoComment} onChange={(e) => setNeedsInfoComment(e.target.value)} placeholder="Комментарий клиенту" className="field-underline px-1 py-1 text-sm w-56" />
                    <button disabled={busy} onClick={() => act(() => transitionOrder(order, "NEEDSINFO", { authorRole: "ADMIN", comment: needsInfoComment || "Требуется доработка" }))} className="btn-outline-ink px-4 py-2 text-xs">На доработку</button>
                  </>
                )}
                {order.status === "SEARCHING" && (
                  <button disabled={busy} onClick={loadCandidates} className="btn-outline-ink px-4 py-2 text-xs">Показать кандидатов</button>
                )}
                {order.status === "DISPUTE" && (
                  <DisputeResolve busy={busy} comment={disputeComment} setComment={setDisputeComment}                     onResolve={(res) => act(() => transitionOrder(order, res, { comment: "Спор решён: " + res + ". " + (disputeComment || "") }))} />
                )}
              </div>
              {order.status === "SEARCHING" && candidates.length > 0 && (
                <div>
                  <div className="font-heading uppercase tracking-wider text-xs text-ink-faint mb-2">Кандидаты (ранжирование)</div>
                  <div className="space-y-1.5">
                    {candidates.slice(0, 5).map((ex, i) => (
                      <div key={ex.id} className="flex flex-wrap items-center gap-2 paper-sheet paper-sheet--pad">
                        <span className="font-mono text-xs w-6">{i + 1}.</span>
                        <span className="font-heading font-bold text-sm">{ex.fullName || "—"}</span>
                        <span className="font-mono text-[11px] text-ink-faint">рейтинг {(ex.ratingAvg || 0).toFixed(1)}</span>
                        <span className="font-mono text-[11px] text-ink-faint">cancelRate {((ex.cancelRate || 0) * 100).toFixed(0)}%</span>
                        <span className="font-mono text-[11px] text-ink-faint">активных {ex.activeOrders || 0}</span>
                        <button disabled={busy} onClick={() => assign(ex)} className="btn-ink px-3 py-1 text-xs ml-auto">Назначить</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </BlankSheet>

        {/* Чат */}
        <BlankSheet className="paper-sheet--pad mb-4">
          <div className="font-heading uppercase tracking-wider text-sm mb-3 border-b border-[hsl(var(--line))] pb-1">Переписка по наряду</div>
          <div ref={chatRef} className="ruled max-h-80 overflow-y-auto pr-1 mb-3" style={{ lineHeight: "32px" }}>
            {messages.length === 0 && <div className="font-body text-sm text-ink-faint py-4">Сообщений пока нет.</div>}
            {messages.map((m) => (
              <div key={m.id} className="py-0.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">{m.senderRole}{m.systemMessage ? " · СИСТЕМА" : ""}: </span>
                <span className="font-body text-sm">{m.text}</span>
                {m.contactExchangeSuspected && <span className="font-mono text-[10px] text-[hsl(var(--stamp-amber))] ml-1">[контакт?]</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Сообщение участникам наряда" className="field-underline flex-1 py-1.5" />
            <button onClick={send} disabled={busy} className="btn-ink px-4 py-1.5 text-xs">Отправить</button>
          </div>
        </BlankSheet>

        {role === "CLIENT" && order.status === "COMPLETED" && (
          <BlankSheet className="paper-sheet--pad mb-4">
            <div className="font-heading uppercase tracking-wider text-sm mb-3 border-b border-[hsl(var(--line))] pb-1">Отзыв исполнителю</div>
            {myReview ? (
              <div className="font-body text-sm">
                <span className="font-mono">Ваша оценка: {myReview.rating}/5</span>
                {myReview.comment && <p className="mt-1">{myReview.comment}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setReviewRating(n)}
                      className={`w-9 h-9 font-mono text-sm ${reviewRating === n ? "btn-ink" : "btn-outline-ink"}`}>{n}</button>
                  ))}
                </div>
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2} placeholder="Комментарий (необязательно)" className="field-underline w-full py-1.5" />
                <button onClick={submitReviewHandler} disabled={busy} className="btn-ink px-4 py-2 text-xs">Оставить отзыв</button>
              </div>
            )}
          </BlankSheet>
        )}

        {/* Журнал печатей */}
        <BlankSheet className="paper-sheet--pad">
          <div className="font-heading uppercase tracking-wider text-sm mb-3 border-b border-[hsl(var(--line))] pb-1">Журнал статусов</div>
          <StatusJournal entries={history} />
        </BlankSheet>
      </main>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="font-heading uppercase tracking-wider text-[11px] text-ink-faint">{label}</div>
      <div className="font-body">{value || "—"}</div>
    </div>
  );
}

function CancelBtn({ busy, cancelReason, setCancelReason, onConfirm }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button disabled={busy} onClick={() => setOpen(true)} className="btn-outline-ink px-4 py-2 text-xs">Отменить наряд</button>;
  return (
    <span className="flex items-center gap-2">
      <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Причина отмены" className="field-underline px-1 py-1 text-sm w-48" />
      <button disabled={busy} onClick={onConfirm} className="btn-ink px-3 py-2 text-xs">Подтвердить отмену</button>
      <button onClick={() => setOpen(false)} className="btn-outline-ink px-3 py-2 text-xs">×</button>
    </span>
  );
}

function DisputeResolve({ busy, comment, setComment, onResolve }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Решение по спору (обязательно)" className="field-underline px-1 py-1 text-sm w-56" />
      <button disabled={busy} onClick={() => onResolve("INPROGRESS")} className="btn-outline-ink px-3 py-2 text-xs">Продолжить</button>
      <button disabled={busy} onClick={() => onResolve("COMPLETED")} className="btn-ink px-3 py-2 text-xs">Завершить</button>
      <button disabled={busy} onClick={() => onResolve("CANCELLED")} className="btn-outline-ink px-3 py-2 text-xs">Отменить</button>
    </span>
  );
}