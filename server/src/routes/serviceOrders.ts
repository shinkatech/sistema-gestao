import { Router } from "express";
import { roundMoney } from "../../../shared/format";
import type { ServiceOrder, ServiceOrderSummary } from "../../../shared/types";
import { receivableDescription } from "../backupData";
import { getDb, transaction } from "../db";
import { asyncRoute, bodyOf, HttpError, parseDate, parseId, parseItems, parsePaymentMethod, routeId } from "../http";
import { nowLocal } from "../time";

export const serviceOrdersRouter = Router();

type OrderRow = {
  id: number;
  number: number;
  client_id: number;
  vehicle_id: number;
  plate: string;
  client_name: string;
  vehicle: string;
  payment_method: string;
  total: number;
  created_at: string;
  updated_at: string;
  receivable_id: number | null;
};

type ItemRow = {
  id: number;
  filter_code: string;
  product_code: string;
  quantity: number;
  unit_price: number;
  total: number;
};

const baseOrder = (row: OrderRow): ServiceOrderSummary => ({
  id: row.id,
  number: row.number,
  clientId: row.client_id,
  vehicleId: row.vehicle_id,
  plate: row.plate,
  clientName: row.client_name,
  vehicle: row.vehicle,
  paymentMethod: row.payment_method,
  total: roundMoney(row.total),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  receivableId: row.receivable_id,
});

const findOrderRow = (id: number) =>
  getDb()
    .prepare(
      `SELECT so.*,
        (SELECT r.id FROM receivables r WHERE r.service_order_id = so.id LIMIT 1) AS receivable_id
       FROM service_orders so
       WHERE so.id = ?`,
    )
    .get(id) as OrderRow | undefined;

const readOrder = (id: number): ServiceOrder => {
  const row = findOrderRow(id);
  if (!row) throw new HttpError(404, "Ordem de serviço não encontrada.");
  const items = getDb()
    .prepare(
      `SELECT id, filter_code, product_code, quantity, unit_price, total
       FROM service_order_items WHERE service_order_id = ? ORDER BY id`,
    )
    .all(id) as ItemRow[];
  return {
    ...baseOrder(row),
    items: items.map((item) => ({
      id: item.id,
      filterCode: item.filter_code,
      productCode: item.product_code,
      quantity: item.quantity,
      unitPrice: roundMoney(item.unit_price),
      total: roundMoney(item.total),
    })),
  };
};

const readContext = (value: Record<string, unknown>) => {
  const clientId = parseId(value.clientId, "Cliente");
  const vehicleId = parseId(value.vehicleId, "Veículo");
  const client = getDb().prepare("SELECT id, name FROM clients WHERE id = ?").get(clientId) as { id: number; name: string } | undefined;
  if (!client) throw new HttpError(400, "Cliente não encontrado.");
  const vehicle = getDb().prepare("SELECT id, plate, model, client_id FROM vehicles WHERE id = ?").get(vehicleId) as
    | { id: number; plate: string; model: string; client_id: number }
    | undefined;
  if (!vehicle || vehicle.client_id !== clientId) {
    throw new HttpError(400, "Selecione um veículo deste cliente.");
  }
  const items = parseItems(value.items);
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const createReceivable = value.createReceivable === true;
  const receivableDueDate = createReceivable ? parseDate(value.receivableDueDate, "Data de vencimento da conta a receber") : null;
  return {
    client,
    vehicle,
    paymentMethod: parsePaymentMethod(value.paymentMethod),
    items,
    total,
    createReceivable,
    receivableDueDate,
  };
};

serviceOrdersRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT so.*,
          (SELECT r.id FROM receivables r WHERE r.service_order_id = so.id LIMIT 1) AS receivable_id
         FROM service_orders so
         ORDER BY so.number DESC`,
      )
      .all() as OrderRow[];
    res.json(rows.map(baseOrder));
  }),
);

serviceOrdersRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    res.json(readOrder(routeId(req.params.id)));
  }),
);

serviceOrdersRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = readContext(bodyOf(req));
    const id = transaction(() => {
      const next = (getDb().prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM service_orders").get() as { next: number }).next;
      const now = nowLocal();
      const result = getDb()
        .prepare(
          `INSERT INTO service_orders (
            number, client_id, vehicle_id, plate, client_name, vehicle, payment_method, total, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          next,
          input.client.id,
          input.vehicle.id,
          input.vehicle.plate,
          input.client.name,
          input.vehicle.model,
          input.paymentMethod,
          input.total,
          now,
          now,
        );
      const orderId = Number(result.lastInsertRowid);
      const insertItem = getDb().prepare(
        `INSERT INTO service_order_items (service_order_id, filter_code, product_code, quantity, unit_price, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      input.items.forEach((item) => {
        insertItem.run(orderId, item.filterCode, item.productCode, item.quantity, item.unitPrice, item.total);
      });
      if (input.createReceivable && input.receivableDueDate) {
        getDb()
          .prepare(
            `INSERT INTO receivables (
              description, client_id, service_order_id, amount, due_date, received_date, status, created_at
            ) VALUES (?, ?, ?, ?, ?, NULL, 'pendente', ?)`,
          )
          .run(receivableDescription(next), input.client.id, orderId, input.total, input.receivableDueDate, now);
      }
      return orderId;
    });
    res.status(201).json(readOrder(id));
  }),
);

serviceOrdersRouter.put(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    const current = findOrderRow(id);
    if (!current) throw new HttpError(404, "Ordem de serviço não encontrada.");
    const input = readContext(bodyOf(req));
    transaction(() => {
      const now = nowLocal();
      getDb()
        .prepare(
          `UPDATE service_orders
           SET client_id = ?, vehicle_id = ?, plate = ?, client_name = ?, vehicle = ?, payment_method = ?, total = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.client.id,
          input.vehicle.id,
          input.vehicle.plate,
          input.client.name,
          input.vehicle.model,
          input.paymentMethod,
          input.total,
          now,
          id,
        );
      getDb().prepare("DELETE FROM service_order_items WHERE service_order_id = ?").run(id);
      const insertItem = getDb().prepare(
        `INSERT INTO service_order_items (service_order_id, filter_code, product_code, quantity, unit_price, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      input.items.forEach((item) => {
        insertItem.run(id, item.filterCode, item.productCode, item.quantity, item.unitPrice, item.total);
      });
      if (input.createReceivable && input.receivableDueDate) {
        const existing = getDb().prepare("SELECT id FROM receivables WHERE service_order_id = ?").get(id);
        if (!existing) {
          getDb()
            .prepare(
              `INSERT INTO receivables (
                description, client_id, service_order_id, amount, due_date, received_date, status, created_at
              ) VALUES (?, ?, ?, ?, ?, NULL, 'pendente', ?)`,
            )
            .run(receivableDescription(current.number), input.client.id, id, input.total, input.receivableDueDate, now);
        }
      }
    });
    res.json(readOrder(id));
  }),
);

serviceOrdersRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    if (!findOrderRow(id)) throw new HttpError(404, "Ordem de serviço não encontrada.");
    getDb().prepare("DELETE FROM service_orders WHERE id = ?").run(id);
    res.json({ ok: true });
  }),
);
