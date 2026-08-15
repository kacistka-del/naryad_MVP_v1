// Статусы и переходы state machine заказа «НАРЯД»

export const STATUS_LIST = [
  "NEW",
  "REVIEW",
  "NEEDSINFO",
  "SEARCHING",
  "ASSIGNED",
  "CONFIRMED",
  "INPROGRESS",
  "AWAITINGCONFIRMATION",
  "COMPLETED",
  "CANCELLED",
  "DISPUTE",
];

export const STATUS_META = {
  NEW: { label: "НОВАЯ", tone: "amber" },
  REVIEW: { label: "ПРОВЕРКА", tone: "amber" },
  NEEDSINFO: { label: "ДОРАБОТКА", tone: "amber" },
  SEARCHING: { label: "ПОИСК", tone: "blue" },
  ASSIGNED: { label: "НАЗНАЧЕН", tone: "blue" },
  CONFIRMED: { label: "ПРИНЯТ", tone: "blue" },
  INPROGRESS: { label: "В РАБОТЕ", tone: "blue" },
  AWAITINGCONFIRMATION: { label: "НА ПОДТВЕРЖДЕНИЕ", tone: "amber" },
  COMPLETED: { label: "ВЫПОЛНЕНО", tone: "green" },
  CANCELLED: { label: "ОТМЕНЁН", tone: "red" },
  DISPUTE: { label: "СПОР", tone: "red" },
};

export const TERMINAL = ["COMPLETED", "CANCELLED"];

// Допустимые переходы из статуса
export const TRANSITIONS = {
  NEW: ["REVIEW", "CANCELLED"],
  REVIEW: ["SEARCHING", "NEEDSINFO", "CANCELLED"],
  NEEDSINFO: ["REVIEW", "CANCELLED"],
  SEARCHING: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["CONFIRMED", "SEARCHING", "CANCELLED", "DISPUTE"],
  CONFIRMED: ["INPROGRESS", "CANCELLED", "DISPUTE"],
  INPROGRESS: ["AWAITINGCONFIRMATION", "CANCELLED", "DISPUTE"],
  AWAITINGCONFIRMATION: ["COMPLETED", "DISPUTE", "CANCELLED"],
  DISPUTE: ["SEARCHING", "INPROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function statusLabel(status) {
  return STATUS_META[status]?.label || status;
}

export function statusTone(status) {
  return STATUS_META[status]?.tone || "amber";
}

export function isTerminal(status) {
  return TERMINAL.includes(status);
}

// Генерация человекочитаемого номера бланка
export function makeOrderNumber(seq) {
  const year = new Date().getFullYear();
  const num = String(seq).padStart(6, "0");
  return `Н-${year}-${num}`;
}

// Роль автора для истории
export function roleLabel(role) {
  switch (role) {
    case "SYSTEM": return "СИСТЕМА";
    case "ADMIN": return "АДМИН";
    case "CLIENT": return "КЛИЕНТ";
    case "EXECUTOR": return "ИСПОЛНИТЕЛЬ";
    default: return role || "—";
  }
}