import { Router } from "express";
import { roundMoney } from "../../../shared/format";
import type { ReportBasis, ReportResult, ReportRow } from "../../../shared/types";
import { getDb } from "../db";
import { asyncRoute, HttpError } from "../http";

export const reportsRouter = Router();

const lastDay = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
};

const resolvePeriod = (query: Record<string, unknown>) => {
  const mode = query.mode ?? "month";
  if (mode === "day") {
    const day = typeof query.day === "string" ? query.day : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "Informe o dia do relatório.");
    return { from: day, to: day };
  }
  if (mode === "range") {
    const from = typeof query.from === "string" ? query.from : "";
    const to = typeof query.to === "string" ? query.to : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new HttpError(400, "Informe as duas datas do período.");
    }
    if (from > to) throw new HttpError(400, "A data inicial não pode ser maior que a data final.");
    return { from, to };
  }
  const month = typeof query.month === "string" ? query.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "Informe o mês do relatório.");
  const end = String(lastDay(month)).padStart(2, "0");
  return { from: `${month}-01`, to: `${month}-${end}` };
};

const queryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const buildReport = (
  kind: "payables" | "receivables",
  query: Record<string, unknown>,
): ReportResult => {
  const period = resolvePeriod({
    mode: queryValue(query.mode),
    month: queryValue(query.month),
    day: queryValue(query.day),
    from: queryValue(query.from),
    to: queryValue(query.to),
  });
  const basisValue = queryValue(query.basis);
  const basis: ReportBasis = basisValue === "settlement" ? "settlement" : "due";
  const requestedStatus = typeof queryValue(query.status) === "string" ? String(queryValue(query.status)) : "todas";
  const allowed = kind === "payables" ? ["todas", "pendente", "pago"] : ["todas", "pendente", "recebido"];
  if (!allowed.includes(requestedStatus)) throw new HttpError(400, "Situação inválida para este relatório.");

  const dateColumn = basis === "due" ? "due_date" : kind === "payables" ? "payment_date" : "received_date";
  const partyColumn = kind === "payables" ? "s.name" : "c.name";
  const table = kind === "payables" ? "payables p JOIN suppliers s ON s.id = p.supplier_id" : "receivables r JOIN clients c ON c.id = r.client_id";
  const alias = kind === "payables" ? "p" : "r";
  const settlementColumn = kind === "payables" ? "p.payment_date" : "r.received_date";

  const rows = getDb()
    .prepare(
      `SELECT
        ${alias}.id AS id,
        ${alias}.description AS description,
        ${partyColumn} AS party_name,
        ${alias}.amount AS amount,
        ${alias}.due_date AS due_date,
        ${settlementColumn} AS settlement_date,
        ${alias}.status AS status
      FROM ${table}
      WHERE ${alias}.${dateColumn} IS NOT NULL
        AND ${alias}.${dateColumn} BETWEEN ? AND ?
        AND (? = 'todas' OR ${alias}.status = ?)
      ORDER BY ${alias}.${dateColumn}, ${alias}.id`,
    )
    .all(period.from, period.to, requestedStatus, requestedStatus) as Array<{
    id: number;
    description: string;
    party_name: string;
    amount: number;
    due_date: string;
    settlement_date: string | null;
    status: string;
  }>;

  const mapped: ReportRow[] = rows.map((row) => ({
    id: row.id,
    description: row.description,
    partyName: row.party_name,
    amount: roundMoney(row.amount),
    dueDate: row.due_date,
    settlementDate: row.settlement_date,
    status: row.status,
  }));

  const sum = (status?: string) =>
    roundMoney(mapped.filter((row) => (status ? row.status === status : true)).reduce((total, row) => total + row.amount, 0));

  return {
    from: period.from,
    to: period.to,
    rows: mapped,
    count: mapped.length,
    total: sum(),
    pendingTotal: sum("pendente"),
    settledTotal: sum(kind === "payables" ? "pago" : "recebido"),
  };
};

reportsRouter.get(
  "/payables",
  asyncRoute(async (req, res) => {
    res.json(buildReport("payables", req.query as Record<string, unknown>));
  }),
);

reportsRouter.get(
  "/receivables",
  asyncRoute(async (req, res) => {
    res.json(buildReport("receivables", req.query as Record<string, unknown>));
  }),
);
