import { Router } from "express";
import { roundMoney } from "../../../shared/format";
import type { Payable, Receivable } from "../../../shared/types";
import { getDb } from "../db";
import { asyncRoute, bodyOf, HttpError, parseDate, parseId, parseMoney, requiredText, routeId } from "../http";
import { nowLocal } from "../time";

export const payablesRouter = Router();
export const receivablesRouter = Router();

type PayableRow = {
  id: number;
  description: string;
  supplier_id: number;
  supplier_name: string;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: "pendente" | "pago";
  created_at: string;
};

type ReceivableRow = {
  id: number;
  description: string;
  client_id: number;
  client_name: string;
  service_order_id: number | null;
  service_order_number: number | null;
  amount: number;
  due_date: string;
  received_date: string | null;
  status: "pendente" | "recebido";
  created_at: string;
};

const mapPayable = (row: PayableRow): Payable => ({
  id: row.id,
  description: row.description,
  supplierId: row.supplier_id,
  supplierName: row.supplier_name,
  amount: roundMoney(row.amount),
  dueDate: row.due_date,
  paymentDate: row.payment_date,
  status: row.status,
  createdAt: row.created_at,
});

const mapReceivable = (row: ReceivableRow): Receivable => ({
  id: row.id,
  description: row.description,
  clientId: row.client_id,
  clientName: row.client_name,
  serviceOrderId: row.service_order_id,
  serviceOrderNumber: row.service_order_number,
  amount: roundMoney(row.amount),
  dueDate: row.due_date,
  receivedDate: row.received_date,
  status: row.status,
  createdAt: row.created_at,
});

const payableSelect = `
  SELECT p.*, s.name AS supplier_name
  FROM payables p
  JOIN suppliers s ON s.id = p.supplier_id
`;

const receivableSelect = `
  SELECT r.*, c.name AS client_name, so.number AS service_order_number
  FROM receivables r
  JOIN clients c ON c.id = r.client_id
  LEFT JOIN service_orders so ON so.id = r.service_order_id
`;

const readPayable = (value: Record<string, unknown>) => {
  const supplierId = parseId(value.supplierId, "Fornecedor");
  const supplier = getDb().prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw new HttpError(400, "Fornecedor não encontrado.");
  const status = value.status === "pago" ? "pago" : value.status === "pendente" ? "pendente" : null;
  if (!status) throw new HttpError(400, "Situação inválida.");
  return {
    description: requiredText(value.description, "Descrição", 160),
    supplierId,
    amount: parseMoney(value.amount, "Valor"),
    dueDate: parseDate(value.dueDate, "Data de vencimento"),
    paymentDate: status === "pago" ? parseDate(value.paymentDate, "Data de pagamento") : null,
    status,
  };
};

const readReceivable = (value: Record<string, unknown>) => {
  const clientId = parseId(value.clientId, "Cliente");
  const client = getDb().prepare("SELECT id FROM clients WHERE id = ?").get(clientId);
  if (!client) throw new HttpError(400, "Cliente não encontrado.");
  const status = value.status === "recebido" ? "recebido" : value.status === "pendente" ? "pendente" : null;
  if (!status) throw new HttpError(400, "Situação inválida.");
  return {
    description: requiredText(value.description, "Descrição", 160),
    clientId,
    amount: parseMoney(value.amount, "Valor"),
    dueDate: parseDate(value.dueDate, "Data de vencimento"),
    receivedDate: status === "recebido" ? parseDate(value.receivedDate, "Data de recebimento") : null,
    status,
  };
};

payablesRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const rows = getDb()
      .prepare(`${payableSelect} ORDER BY CASE p.status WHEN 'pendente' THEN 0 ELSE 1 END, p.due_date, p.id`)
      .all() as PayableRow[];
    res.json(rows.map(mapPayable));
  }),
);

payablesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = readPayable(bodyOf(req));
    const result = getDb()
      .prepare(
        `INSERT INTO payables (description, supplier_id, amount, due_date, payment_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.description, input.supplierId, input.amount, input.dueDate, input.paymentDate, input.status, nowLocal());
    const row = getDb().prepare(`${payableSelect} WHERE p.id = ?`).get(Number(result.lastInsertRowid)) as PayableRow;
    res.status(201).json(mapPayable(row));
  }),
);

payablesRouter.put(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    const existing = getDb().prepare("SELECT id FROM payables WHERE id = ?").get(id);
    if (!existing) throw new HttpError(404, "Conta a pagar não encontrada.");
    const input = readPayable(bodyOf(req));
    getDb()
      .prepare(
        `UPDATE payables
         SET description = ?, supplier_id = ?, amount = ?, due_date = ?, payment_date = ?, status = ?
         WHERE id = ?`,
      )
      .run(input.description, input.supplierId, input.amount, input.dueDate, input.paymentDate, input.status, id);
    res.json(mapPayable(getDb().prepare(`${payableSelect} WHERE p.id = ?`).get(id) as PayableRow));
  }),
);

payablesRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    const result = getDb().prepare("DELETE FROM payables WHERE id = ?").run(id);
    if (result.changes === 0) throw new HttpError(404, "Conta a pagar não encontrada.");
    res.json({ ok: true });
  }),
);

receivablesRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const rows = getDb()
      .prepare(`${receivableSelect} ORDER BY CASE r.status WHEN 'pendente' THEN 0 ELSE 1 END, r.due_date, r.id`)
      .all() as ReceivableRow[];
    res.json(rows.map(mapReceivable));
  }),
);

receivablesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = readReceivable(bodyOf(req));
    const result = getDb()
      .prepare(
        `INSERT INTO receivables (description, client_id, amount, due_date, received_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.description, input.clientId, input.amount, input.dueDate, input.receivedDate, input.status, nowLocal());
    const row = getDb().prepare(`${receivableSelect} WHERE r.id = ?`).get(Number(result.lastInsertRowid)) as ReceivableRow;
    res.status(201).json(mapReceivable(row));
  }),
);

receivablesRouter.put(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    const existing = getDb().prepare("SELECT id FROM receivables WHERE id = ?").get(id);
    if (!existing) throw new HttpError(404, "Conta a receber não encontrada.");
    const input = readReceivable(bodyOf(req));
    getDb()
      .prepare(
        `UPDATE receivables
         SET description = ?, client_id = ?, amount = ?, due_date = ?, received_date = ?, status = ?
         WHERE id = ?`,
      )
      .run(input.description, input.clientId, input.amount, input.dueDate, input.receivedDate, input.status, id);
    res.json(mapReceivable(getDb().prepare(`${receivableSelect} WHERE r.id = ?`).get(id) as ReceivableRow));
  }),
);

receivablesRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    const result = getDb().prepare("DELETE FROM receivables WHERE id = ?").run(id);
    if (result.changes === 0) throw new HttpError(404, "Conta a receber não encontrada.");
    res.json({ ok: true });
  }),
);
