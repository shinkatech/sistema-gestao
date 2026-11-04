import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const dataDir = path.join(serverRoot, "data");
export const backupDir = path.join(dataDir, "backups");
export const dbPath = path.join(dataDir, "gestao.db");

let database: DatabaseSync | null = null;

const schema = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  plate TEXT NOT NULL,
  client_name TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  total REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_order_id INTEGER NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  filter_code TEXT NOT NULL DEFAULT '',
  product_code TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  payment_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'pago')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receivables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  service_order_id INTEGER REFERENCES service_orders(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  received_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'recebido')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicles_client ON vehicles(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON service_orders(number);
CREATE INDEX IF NOT EXISTS idx_orders_client ON service_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON service_order_items(service_order_id);
CREATE INDEX IF NOT EXISTS idx_payables_due ON payables(due_date, status);
CREATE INDEX IF NOT EXISTS idx_payables_supplier ON payables(supplier_id);
CREATE INDEX IF NOT EXISTS idx_receivables_due ON receivables(due_date, status);
CREATE INDEX IF NOT EXISTS idx_receivables_client ON receivables(client_id);
CREATE INDEX IF NOT EXISTS idx_receivables_order ON receivables(service_order_id);
`;

const openDatabase = () => {
  const next = new DatabaseSync(dbPath);
  next.exec("PRAGMA foreign_keys = ON");
  next.exec("PRAGMA journal_mode = WAL");
  next.exec(schema);
  return next;
};

export const initDatabase = () => {
  fs.mkdirSync(backupDir, { recursive: true });
  database = openDatabase();
};

export const getDb = () => {
  if (!database) throw new Error("Banco de dados ainda não foi iniciado.");
  return database;
};

export const transaction = <T>(run: () => T): T => {
  const current = getDb();
  current.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    current.exec("COMMIT");
    return result;
  } catch (error) {
    current.exec("ROLLBACK");
    throw error;
  }
};

export const replaceDatabaseFile = (sourcePath: string) => {
  const tempPath = path.join(dataDir, "restore.tmp.db");
  fs.copyFileSync(sourcePath, tempPath);
  const current = getDb();
  current.close();
  database = null;
  try {
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.rmSync(dbPath, { force: true });
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    if (!fs.existsSync(dbPath) && fs.existsSync(tempPath)) {
      fs.renameSync(tempPath, dbPath);
    }
    database = openDatabase();
    throw error;
  }
  database = openDatabase();
};
