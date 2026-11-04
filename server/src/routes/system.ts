import path from "node:path";
import { Router } from "express";
import { roundMoney } from "../../../shared/format";
import type { DashboardSummary, Settings } from "../../../shared/types";
import { createBackupFile, listBackups, restoreBackupFile } from "../backup";
import { exportPayload, importPayload } from "../backupData";
import { backupDir, getDb } from "../db";
import { asyncRoute, bodyOf, optionalText } from "../http";
import { todayLocal } from "../time";

export const dashboardRouter = Router();
export const settingsRouter = Router();
export const backupsRouter = Router();

const countOf = (sql: string, ...params: Array<string | number>) => {
  const row = getDb().prepare(sql).get(...params) as { total: number | null; count: number };
  return { count: row.count ?? 0, amount: roundMoney(row.total ?? 0) };
};

dashboardRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const today = todayLocal();
    const pendingPayables = countOf("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM payables WHERE status = 'pendente'");
    const pendingReceivables = countOf("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM receivables WHERE status = 'pendente'");
    const duePayables = countOf(
      "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM payables WHERE status = 'pendente' AND due_date = ?",
      today,
    );
    const dueReceivables = countOf(
      "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM receivables WHERE status = 'pendente' AND due_date = ?",
      today,
    );
    const scalar = (sql: string) => (getDb().prepare(sql).get() as { total: number }).total;
    const recentOrders = getDb()
      .prepare(
        `SELECT id, number, client_name, plate, vehicle, total, created_at
         FROM service_orders
         ORDER BY number DESC
         LIMIT 8`,
      )
      .all() as Array<{
      id: number;
      number: number;
      client_name: string;
      plate: string;
      vehicle: string;
      total: number;
      created_at: string;
    }>;

    const summary: DashboardSummary = {
      clients: scalar("SELECT COUNT(*) AS total FROM clients"),
      vehicles: scalar("SELECT COUNT(*) AS total FROM vehicles"),
      suppliers: scalar("SELECT COUNT(*) AS total FROM suppliers"),
      serviceOrders: scalar("SELECT COUNT(*) AS total FROM service_orders"),
      pendingPayables: pendingPayables.count,
      pendingPayablesAmount: pendingPayables.amount,
      pendingReceivables: pendingReceivables.count,
      pendingReceivablesAmount: pendingReceivables.amount,
      dueTodayPayablesAmount: duePayables.amount,
      dueTodayReceivablesAmount: dueReceivables.amount,
      recentOrders: recentOrders.map((row) => ({
        id: row.id,
        number: row.number,
        clientName: row.client_name,
        plate: row.plate,
        vehicle: row.vehicle,
        total: roundMoney(row.total),
        createdAt: row.created_at,
      })),
    };
    res.json(summary);
  }),
);

const readSettings = (): Settings => {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'company_name'").get() as { value: string } | undefined;
  return { companyName: row?.value ?? "" };
};

settingsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    res.json(readSettings());
  }),
);

settingsRouter.put(
  "/",
  asyncRoute(async (req, res) => {
    const companyName = optionalText(bodyOf(req).companyName, "Nome da empresa", 80);
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('company_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(companyName);
    res.json(readSettings());
  }),
);

backupsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    res.json(listBackups());
  }),
);

backupsRouter.post(
  "/",
  asyncRoute(async (_req, res) => {
    const file = await createBackupFile();
    res.status(201).json(file);
  }),
);

backupsRouter.get(
  "/export",
  asyncRoute(async (_req, res) => {
    res.setHeader("Content-Disposition", 'attachment; filename="servios-backup.json"');
    res.json(exportPayload());
  }),
);

backupsRouter.post(
  "/import",
  asyncRoute(async (req, res) => {
    res.json(importPayload(req.body));
  }),
);

backupsRouter.get(
  "/:fileName/download",
  asyncRoute(async (req, res) => {
    const fileName = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
    const file = listBackups().files.find((item) => item.fileName === fileName);
    if (!file) {
      res.status(404).json({ error: "Cópia não encontrada." });
      return;
    }
    res.download(path.join(backupDir, file.fileName), file.fileName);
  }),
);

backupsRouter.post(
  "/:fileName/restore",
  asyncRoute(async (req, res) => {
    const fileName = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
    restoreBackupFile(fileName);
    res.json({ ok: true });
  }),
);
