import { formatOrderNumber, roundMoney } from "../../shared/format";
import type {
  BackupPayload,
  Client,
  Payable,
  Receivable,
  ServiceOrder,
  Supplier,
  Vehicle,
} from "../../shared/types";
import { getDb, transaction } from "./db";
import {
  HttpError,
  optionalText,
  parseCep,
  parseCnpj,
  parseDate,
  parseId,
  parseItems,
  parseMoney,
  parsePaymentMethod,
  parsePlate,
  requiredText,
} from "./http";
import { nowLocal } from "./time";

type ClientRow = {
  id: number;
  name: string;
  address: string;
  zip_code: string;
  created_at: string;
};

type VehicleRow = {
  id: number;
  plate: string;
  model: string;
  client_id: number;
  client_name: string;
  created_at: string;
};

type SupplierRow = {
  id: number;
  cnpj: string;
  name: string;
  address: string;
  zip_code: string;
  created_at: string;
};

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
  service_order_id: number;
  filter_code: string;
  product_code: string;
  quantity: number;
  unit_price: number;
  total: number;
};

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

const companyName = () => {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'company_name'").get() as { value: string } | undefined;
  return row?.value ?? "";
};

export const exportPayload = (): BackupPayload => {
  const clients = (getDb().prepare("SELECT * FROM clients ORDER BY id").all() as ClientRow[]).map(
    (row): Client => ({
      id: row.id,
      name: row.name,
      address: row.address,
      zipCode: row.zip_code,
      createdAt: row.created_at,
    }),
  );

  const vehicles = (
    getDb()
      .prepare(
        `SELECT v.*, c.name AS client_name
         FROM vehicles v JOIN clients c ON c.id = v.client_id
         ORDER BY v.id`,
      )
      .all() as VehicleRow[]
  ).map(
    (row): Vehicle => ({
      id: row.id,
      plate: row.plate,
      model: row.model,
      clientId: row.client_id,
      clientName: row.client_name,
      createdAt: row.created_at,
    }),
  );

  const suppliers = (getDb().prepare("SELECT * FROM suppliers ORDER BY id").all() as SupplierRow[]).map(
    (row): Supplier => ({
      id: row.id,
      cnpj: row.cnpj,
      name: row.name,
      address: row.address,
      zipCode: row.zip_code,
      createdAt: row.created_at,
    }),
  );

  const itemRows = getDb().prepare("SELECT * FROM service_order_items ORDER BY id").all() as ItemRow[];
  const itemsByOrder = new Map<number, ServiceOrder["items"]>();
  itemRows.forEach((row) => {
    const list = itemsByOrder.get(row.service_order_id) ?? [];
    list.push({
      id: row.id,
      filterCode: row.filter_code,
      productCode: row.product_code,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      total: roundMoney(row.total),
    });
    itemsByOrder.set(row.service_order_id, list);
  });

  const serviceOrders = (
    getDb()
      .prepare(
        `SELECT so.*,
           (SELECT r.id FROM receivables r WHERE r.service_order_id = so.id LIMIT 1) AS receivable_id
         FROM service_orders so
         ORDER BY so.id`,
      )
      .all() as OrderRow[]
  ).map(
    (row): ServiceOrder => ({
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
      items: itemsByOrder.get(row.id) ?? [],
      receivableId: row.receivable_id,
    }),
  );

  const payables = (
    getDb()
      .prepare(
        `SELECT p.*, s.name AS supplier_name
         FROM payables p JOIN suppliers s ON s.id = p.supplier_id
         ORDER BY p.id`,
      )
      .all() as PayableRow[]
  ).map(
    (row): Payable => ({
      id: row.id,
      description: row.description,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      amount: roundMoney(row.amount),
      dueDate: row.due_date,
      paymentDate: row.payment_date,
      status: row.status,
      createdAt: row.created_at,
    }),
  );

  const receivables = (
    getDb()
      .prepare(
        `SELECT r.*, c.name AS client_name, so.number AS service_order_number
         FROM receivables r
         JOIN clients c ON c.id = r.client_id
         LEFT JOIN service_orders so ON so.id = r.service_order_id
         ORDER BY r.id`,
      )
      .all() as ReceivableRow[]
  ).map(
    (row): Receivable => ({
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
    }),
  );

  return {
    version: 1,
    createdAt: nowLocal(),
    companyName: companyName(),
    clients,
    vehicles,
    suppliers,
    serviceOrders,
    payables,
    receivables,
  };
};

const asRecords = (value: unknown, label: string) => {
  if (!Array.isArray(value)) throw new HttpError(400, `${label} inválido no arquivo.`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HttpError(400, `${label} inválido no arquivo.`);
    }
    return item as Record<string, unknown>;
  });
};

const keepStamp = (value: unknown) => {
  if (typeof value === "string" && value.length <= 32) return value;
  return nowLocal();
};

const uniqueIds = (ids: number[], label: string) => {
  if (new Set(ids).size !== ids.length) throw new HttpError(400, `Há identificadores repetidos em ${label}.`);
};

export const importPayload = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Arquivo de backup inválido.");
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) throw new HttpError(400, "Versão de backup não suportada.");

  const clients = asRecords(raw.clients, "Clientes").map((row) => ({
    id: parseId(row.id, "Cliente"),
    name: requiredText(row.name, "Nome do cliente", 120),
    address: requiredText(row.address, "Endereço do cliente", 180),
    zipCode: parseCep(row.zipCode),
    createdAt: keepStamp(row.createdAt),
  }));
  uniqueIds(clients.map((item) => item.id), "clientes");

  const clientIds = new Set(clients.map((item) => item.id));
  const vehicles = asRecords(raw.vehicles, "Veículos").map((row) => {
    const clientId = parseId(row.clientId, "Cliente do veículo");
    if (!clientIds.has(clientId)) throw new HttpError(400, "Há um veículo vinculado a um cliente inexistente.");
    return {
      id: parseId(row.id, "Veículo"),
      plate: parsePlate(row.plate),
      model: requiredText(row.model, "Modelo do veículo", 80),
      clientId,
      createdAt: keepStamp(row.createdAt),
    };
  });
  uniqueIds(vehicles.map((item) => item.id), "veículos");
  const plates = vehicles.map((item) => item.plate);
  if (new Set(plates).size !== plates.length) throw new HttpError(400, "Há placas repetidas no arquivo.");

  const suppliers = asRecords(raw.suppliers, "Fornecedores").map((row) => ({
    id: parseId(row.id, "Fornecedor"),
    cnpj: parseCnpj(row.cnpj),
    name: requiredText(row.name, "Nome do fornecedor", 140),
    address: requiredText(row.address, "Endereço do fornecedor", 180),
    zipCode: parseCep(row.zipCode),
    createdAt: keepStamp(row.createdAt),
  }));
  uniqueIds(suppliers.map((item) => item.id), "fornecedores");
  const documents = suppliers.map((item) => item.cnpj);
  if (new Set(documents).size !== documents.length) throw new HttpError(400, "Há CNPJs repetidos no arquivo.");

  const vehicleIds = new Set(vehicles.map((item) => item.id));
  const vehiclesById = new Map(vehicles.map((item) => [item.id, item]));
  const serviceOrders = asRecords(raw.serviceOrders, "Ordens de serviço").map((row) => {
    const clientId = parseId(row.clientId, "Cliente da ordem");
    const vehicleId = parseId(row.vehicleId, "Veículo da ordem");
    const vehicle = vehiclesById.get(vehicleId);
    if (!clientIds.has(clientId) || !vehicle || vehicle.clientId !== clientId) {
      throw new HttpError(400, "Há uma ordem de serviço com cliente ou veículo inconsistente.");
    }
    const items = parseItems(row.items);
    const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    return {
      id: parseId(row.id, "Ordem de serviço"),
      number: parseId(row.number, "Número da ordem"),
      clientId,
      vehicleId,
      plate: parsePlate(row.plate),
      clientName: requiredText(row.clientName, "Nome do cliente na ordem", 120),
      vehicle: requiredText(row.vehicle, "Veículo na ordem", 80),
      paymentMethod: parsePaymentMethod(row.paymentMethod),
      total,
      createdAt: keepStamp(row.createdAt),
      updatedAt: keepStamp(row.updatedAt),
      items,
    };
  });
  uniqueIds(serviceOrders.map((item) => item.id), "ordens de serviço");
  const numbers = serviceOrders.map((item) => item.number);
  if (new Set(numbers).size !== numbers.length) throw new HttpError(400, "Há números de OS repetidos no arquivo.");
  if (!vehicleIds.size && serviceOrders.length) {
    throw new HttpError(400, "Há ordens sem veículos cadastrados.");
  }

  const supplierIds = new Set(suppliers.map((item) => item.id));
  const payables = asRecords(raw.payables, "Contas a pagar").map((row) => {
    const supplierId = parseId(row.supplierId, "Fornecedor da conta");
    if (!supplierIds.has(supplierId)) throw new HttpError(400, "Há uma conta a pagar de fornecedor inexistente.");
    const status = row.status === "pago" ? "pago" : row.status === "pendente" ? "pendente" : null;
    if (!status) throw new HttpError(400, "Situação de conta a pagar inválida.");
    const paymentDate = status === "pago" ? parseDate(row.paymentDate, "Data de pagamento") : null;
    return {
      id: parseId(row.id, "Conta a pagar"),
      description: requiredText(row.description, "Descrição da conta a pagar", 160),
      supplierId,
      amount: parseMoney(row.amount, "Valor da conta a pagar"),
      dueDate: parseDate(row.dueDate, "Data de vencimento"),
      paymentDate,
      status,
      createdAt: keepStamp(row.createdAt),
    };
  });
  uniqueIds(payables.map((item) => item.id), "contas a pagar");

  const orderIds = new Set(serviceOrders.map((item) => item.id));
  const receivables = asRecords(raw.receivables, "Contas a receber").map((row) => {
    const clientId = parseId(row.clientId, "Cliente da conta");
    if (!clientIds.has(clientId)) throw new HttpError(400, "Há uma conta a receber de cliente inexistente.");
    const serviceOrderId = row.serviceOrderId == null || row.serviceOrderId === "" ? null : parseId(row.serviceOrderId, "Ordem vinculada");
    if (serviceOrderId != null && !orderIds.has(serviceOrderId)) {
      throw new HttpError(400, "Há uma conta a receber vinculada a uma OS inexistente.");
    }
    const status = row.status === "recebido" ? "recebido" : row.status === "pendente" ? "pendente" : null;
    if (!status) throw new HttpError(400, "Situação de conta a receber inválida.");
    const receivedDate = status === "recebido" ? parseDate(row.receivedDate, "Data de recebimento") : null;
    return {
      id: parseId(row.id, "Conta a receber"),
      description: requiredText(row.description, "Descrição da conta a receber", 160),
      clientId,
      serviceOrderId,
      amount: parseMoney(row.amount, "Valor da conta a receber"),
      dueDate: parseDate(row.dueDate, "Data de vencimento"),
      receivedDate,
      status,
      createdAt: keepStamp(row.createdAt),
    };
  });
  uniqueIds(receivables.map((item) => item.id), "contas a receber");

  const nextCompanyName = optionalText(raw.companyName, "Nome da empresa", 80);

  transaction(() => {
    const database = getDb();
    database.exec("DELETE FROM service_order_items");
    database.exec("DELETE FROM receivables");
    database.exec("DELETE FROM payables");
    database.exec("DELETE FROM service_orders");
    database.exec("DELETE FROM vehicles");
    database.exec("DELETE FROM suppliers");
    database.exec("DELETE FROM clients");
    database.exec("DELETE FROM settings");

    const insertClient = database.prepare("INSERT INTO clients (id, name, address, zip_code, created_at) VALUES (?, ?, ?, ?, ?)");
    clients.forEach((item) => insertClient.run(item.id, item.name, item.address, item.zipCode, item.createdAt));

    const insertVehicle = database.prepare("INSERT INTO vehicles (id, plate, model, client_id, created_at) VALUES (?, ?, ?, ?, ?)");
    vehicles.forEach((item) => insertVehicle.run(item.id, item.plate, item.model, item.clientId, item.createdAt));

    const insertSupplier = database.prepare("INSERT INTO suppliers (id, cnpj, name, address, zip_code, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    suppliers.forEach((item) => insertSupplier.run(item.id, item.cnpj, item.name, item.address, item.zipCode, item.createdAt));

    const insertOrder = database.prepare(
      `INSERT INTO service_orders (
        id, number, client_id, vehicle_id, plate, client_name, vehicle, payment_method, total, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertItem = database.prepare(
      `INSERT INTO service_order_items (service_order_id, filter_code, product_code, quantity, unit_price, total)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    serviceOrders.forEach((item) => {
      insertOrder.run(
        item.id,
        item.number,
        item.clientId,
        item.vehicleId,
        item.plate,
        item.clientName,
        item.vehicle,
        item.paymentMethod,
        item.total,
        item.createdAt,
        item.updatedAt,
      );
      item.items.forEach((line) => {
        insertItem.run(item.id, line.filterCode, line.productCode, line.quantity, line.unitPrice, line.total);
      });
    });

    const insertPayable = database.prepare(
      `INSERT INTO payables (id, description, supplier_id, amount, due_date, payment_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    payables.forEach((item) => {
      insertPayable.run(item.id, item.description, item.supplierId, item.amount, item.dueDate, item.paymentDate, item.status, item.createdAt);
    });

    const insertReceivable = database.prepare(
      `INSERT INTO receivables (
        id, description, client_id, service_order_id, amount, due_date, received_date, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    receivables.forEach((item) => {
      insertReceivable.run(
        item.id,
        item.description,
        item.clientId,
        item.serviceOrderId,
        item.amount,
        item.dueDate,
        item.receivedDate,
        item.status,
        item.createdAt,
      );
    });

    if (nextCompanyName) {
      database.prepare("INSERT INTO settings (key, value) VALUES ('company_name', ?)").run(nextCompanyName);
    }

    const sequences: Array<[string, number]> = [
      ["clients", clients.reduce((max, item) => Math.max(max, item.id), 0)],
      ["vehicles", vehicles.reduce((max, item) => Math.max(max, item.id), 0)],
      ["suppliers", suppliers.reduce((max, item) => Math.max(max, item.id), 0)],
      ["service_orders", serviceOrders.reduce((max, item) => Math.max(max, item.id), 0)],
      ["service_order_items", 0],
      ["payables", payables.reduce((max, item) => Math.max(max, item.id), 0)],
      ["receivables", receivables.reduce((max, item) => Math.max(max, item.id), 0)],
    ];
    const maxItemId = (
      database.prepare("SELECT COALESCE(MAX(id), 0) AS max_id FROM service_order_items").get() as { max_id: number }
    ).max_id;
    sequences[4][1] = maxItemId;
    const updateSequence = database.prepare(
      "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET seq = excluded.seq",
    );
    sequences.forEach(([name, seq]) => updateSequence.run(name, seq));
  });

  return { ok: true as const, orders: serviceOrders.length };
};

export const receivableDescription = (orderNumber: number) => `Ordem de serviço nº ${formatOrderNumber(orderNumber)}`;
