import { Router } from "express";
import type { Client } from "../../../shared/types";
import { getDb } from "../db";
import { asyncRoute, bodyOf, HttpError, parseCep, requiredText, rethrowDb, routeId } from "../http";
import { nowLocal } from "../time";

export const clientsRouter = Router();

type ClientRow = {
  id: number;
  name: string;
  address: string;
  zip_code: string;
  created_at: string;
};

const mapClient = (row: ClientRow): Client => ({
  id: row.id,
  name: row.name,
  address: row.address,
  zipCode: row.zip_code,
  createdAt: row.created_at,
});

const readInput = (value: Record<string, unknown>) => ({
  name: requiredText(value.name, "Nome", 120),
  address: requiredText(value.address, "Endereço", 180),
  zipCode: parseCep(value.zipCode),
});

const findClient = (id: number) => getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) as ClientRow | undefined;

clientsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const rows = getDb().prepare("SELECT * FROM clients ORDER BY name").all() as ClientRow[];
    res.json(rows.map(mapClient));
  }),
);

clientsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = readInput(bodyOf(req));
    try {
      const result = getDb()
        .prepare("INSERT INTO clients (name, address, zip_code, created_at) VALUES (?, ?, ?, ?)")
        .run(input.name, input.address, input.zipCode, nowLocal());
      const row = findClient(Number(result.lastInsertRowid));
      res.status(201).json(mapClient(row!));
    } catch (error) {
      rethrowDb(error, "Não foi possível salvar o cliente.");
    }
  }),
);

clientsRouter.put(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    if (!findClient(id)) throw new HttpError(404, "Cliente não encontrado.");
    const input = readInput(bodyOf(req));
    getDb().prepare("UPDATE clients SET name = ?, address = ?, zip_code = ? WHERE id = ?").run(input.name, input.address, input.zipCode, id);
    res.json(mapClient(findClient(id)!));
  }),
);

clientsRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    if (!findClient(id)) throw new HttpError(404, "Cliente não encontrado.");
    const linked = getDb()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM vehicles WHERE client_id = ?) AS vehicles,
          (SELECT COUNT(*) FROM service_orders WHERE client_id = ?) AS orders,
          (SELECT COUNT(*) FROM receivables WHERE client_id = ?) AS receivables`,
      )
      .get(id, id, id) as { vehicles: number; orders: number; receivables: number };
    if (linked.vehicles + linked.orders + linked.receivables > 0) {
      throw new HttpError(409, "Não é possível excluir este cliente porque há veículos, ordens de serviço ou contas a receber vinculados.");
    }
    getDb().prepare("DELETE FROM clients WHERE id = ?").run(id);
    res.json({ ok: true });
  }),
);
