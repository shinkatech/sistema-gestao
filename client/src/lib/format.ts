import { formatCep, formatCnpj, formatOrderNumber, isValidCnpj, isValidPlate, normalizePlate, onlyDigits, roundMoney } from "@shared/format";

export { formatCep, formatCnpj, formatOrderNumber, isValidCnpj, isValidPlate, normalizePlate, onlyDigits, roundMoney };

const pad = (value: number) => String(value).padStart(2, "0");

export const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
};

export const formatMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatDecimal = (value: number) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const parseDecimal = (value: string) => {
  const cleaned = value.trim().replace(/\s/g, "").replace(/^R\$\s?/, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) ? roundMoney(number) : 0;
};

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

export const formatDateTime = (value: string) => {
  const [date, time] = value.split(" ");
  return `${formatDate(date)} ${time?.slice(0, 5) ?? ""}`.trim();
};

export const fold = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{M}/gu, "");

export const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, (monthNumber || 1) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export const isOverdue = (dueDate: string, status: string) => status === "pendente" && dueDate < todayISO();

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível concluir a operação.";
