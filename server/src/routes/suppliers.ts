import { Router } from "express";
import { formatCnpj } from "../../../shared/format";
import type { Supplier } from "../../../shared/types";
import { getDb } from "../db";
import { asyncRoute, bodyOf, HttpError, parseCep, parseCnpj, requiredText, rethrowDb, routeId } from "../http";
import { nowLocal } from "../time";

export const suppliersRouter = Router();

type SupplierRow = {
  id: number;
  cnpj: string;
  name: string;
  address: string;
  zip_code: string;
  created_at: string;
};

const mapSupplier = (row: SupplierRow): Supplier => ({
  id: row.id,
  cnpj: formatCnpj(row.cnpj),
  name: row.name,
  address: row.address,
  zipCode: row.zip_code,
  createdAt: row.created_at,
});

const findSupplier = (id: number) => getDb().prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as SupplierRow | undefined;

const readInput = (value: Record<string, unknown>) => ({
  cnpj: parseCnpj(value.cnpj),
  name: requiredText(value.name, "Nome ou razão social", 140),
  address: requiredText(value.address, "Endereço", 180),
  zipCode: parseCep(value.zipCode),
});

suppliersRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const rows = getDb().prepare("SELECT * FROM suppliers ORDER BY name").all() as SupplierRow[];
    res.json(rows.map(mapSupplier));
  }),
);

suppliersRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = readInput(bodyOf(req));
    try {
      const result = getDb()
        .prepare("INSERT INTO suppliers (cnpj, name, address, zip_code, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(input.cnpj, input.name, input.address, input.zipCode, nowLocal());
      res.status(201).json(mapSupplier(findSupplier(Number(result.lastInsertRowid))!));
    } catch (error) {
      rethrowDb(error, "Já existe um fornecedor com esse CNPJ.");
    }
  }),
);

suppliersRouter.put(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    if (!findSupplier(id)) throw new HttpError(404, "Fornecedor não encontrado.");
    const input = readInput(bodyOf(req));
    try {
      getDb()
        .prepare("UPDATE suppliers SET cnpj = ?, name = ?, address = ?, zip_code = ? WHERE id = ?")
        .run(input.cnpj, input.name, input.address, input.zipCode, id);
    } catch (error) {
      rethrowDb(error, "Já existe um fornecedor com esse CNPJ.");
    }
    res.json(mapSupplier(findSupplier(id)!));
  }),
);

suppliersRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    if (!findSupplier(id)) throw new HttpError(404, "Fornecedor não encontrado.");
    const linked = getDb().prepare("SELECT COUNT(*) AS total FROM payables WHERE supplier_id = ?").get(id) as { total: number };
    if (linked.total > 0) {
      throw new HttpError(409, "Não é possível excluir este fornecedor porque há contas a pagar vinculadas.");
    }
    getDb().prepare("DELETE FROM suppliers WHERE id = ?").run(id);
    res.json({ ok: true });
  }),
);
