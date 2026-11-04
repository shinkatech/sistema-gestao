import { Router } from "express";
import type { Vehicle } from "../../../shared/types";
import { getDb } from "../db";
import { asyncRoute, bodyOf, HttpError, parseId, parsePlate, requiredText, rethrowDb, routeId } from "../http";
import { nowLocal } from "../time";

export const vehiclesRouter = Router();

type VehicleRow = {
  id: number;
  plate: string;
  model: string;
  client_id: number;
  client_name: string;
  created_at: string;
};

const mapVehicle = (row: VehicleRow): Vehicle => ({
  id: row.id,
  plate: row.plate,
  model: row.model,
  clientId: row.client_id,
  clientName: row.client_name,
  createdAt: row.created_at,
});

const selectVehicle = `
  SELECT v.*, c.name AS client_name
  FROM vehicles v
  JOIN clients c ON c.id = v.client_id
`;

const findVehicle = (id: number) => getDb().prepare(`${selectVehicle} WHERE v.id = ?`).get(id) as VehicleRow | undefined;

const readInput = (value: Record<string, unknown>) => {
  const clientId = parseId(value.clientId, "Cliente");
  const client = getDb().prepare("SELECT id FROM clients WHERE id = ?").get(clientId);
  if (!client) throw new HttpError(400, "Cliente não encontrado.");
  return {
    plate: parsePlate(value.plate),
    model: requiredText(value.model, "Modelo", 80),
    clientId,
  };
};

vehiclesRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const rows = getDb().prepare(`${selectVehicle} ORDER BY v.plate`).all() as VehicleRow[];
    res.json(rows.map(mapVehicle));
  }),
);

vehiclesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = readInput(bodyOf(req));
    try {
      const result = getDb()
        .prepare("INSERT INTO vehicles (plate, model, client_id, created_at) VALUES (?, ?, ?, ?)")
        .run(input.plate, input.model, input.clientId, nowLocal());
      res.status(201).json(mapVehicle(findVehicle(Number(result.lastInsertRowid))!));
    } catch (error) {
      rethrowDb(error, "Já existe um veículo com essa placa.");
    }
  }),
);

vehiclesRouter.put(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    if (!findVehicle(id)) throw new HttpError(404, "Veículo não encontrado.");
    const input = readInput(bodyOf(req));
    try {
      getDb().prepare("UPDATE vehicles SET plate = ?, model = ?, client_id = ? WHERE id = ?").run(input.plate, input.model, input.clientId, id);
    } catch (error) {
      rethrowDb(error, "Já existe um veículo com essa placa.");
    }
    res.json(mapVehicle(findVehicle(id)!));
  }),
);

vehiclesRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = routeId(req.params.id);
    if (!findVehicle(id)) throw new HttpError(404, "Veículo não encontrado.");
    const linked = getDb().prepare("SELECT COUNT(*) AS total FROM service_orders WHERE vehicle_id = ?").get(id) as { total: number };
    if (linked.total > 0) {
      throw new HttpError(409, "Não é possível excluir este veículo porque há ordens de serviço vinculadas.");
    }
    getDb().prepare("DELETE FROM vehicles WHERE id = ?").run(id);
    res.json({ ok: true });
  }),
);
