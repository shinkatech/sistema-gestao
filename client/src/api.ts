import type {
  BackupFileInfo,
  BackupList,
  BackupPayload,
  Client,
  ClientInput,
  DashboardSummary,
  Payable,
  PayableInput,
  Receivable,
  ReceivableInput,
  ReportResult,
  ServiceOrder,
  ServiceOrderInput,
  ServiceOrderSummary,
  Settings,
  Supplier,
  SupplierInput,
  Vehicle,
  VehicleInput,
} from "@shared/types";

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Não foi possível concluir a operação.");
  }
  return payload as T;
};

const crud = <T, TInput>(base: string) => ({
  list: () => request<T[]>(base),
  create: (input: TInput) => request<T>(base, { method: "POST", body: JSON.stringify(input) }),
  update: (id: number, input: TInput) => request<T>(`${base}/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (id: number) => request<{ ok: true }>(`${base}/${id}`, { method: "DELETE" }),
});

const downloadBlob = async (path: string, fileName: string) => {
  const response = await fetch(path);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Não foi possível baixar o arquivo.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const api = {
  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  settings: {
    get: () => request<Settings>("/api/settings"),
    update: (companyName: string) => request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify({ companyName }) }),
  },
  clients: crud<Client, ClientInput>("/api/clients"),
  vehicles: crud<Vehicle, VehicleInput>("/api/vehicles"),
  suppliers: crud<Supplier, SupplierInput>("/api/suppliers"),
  payables: crud<Payable, PayableInput>("/api/payables"),
  receivables: crud<Receivable, ReceivableInput>("/api/receivables"),
  orders: {
    list: () => request<ServiceOrderSummary[]>("/api/service-orders"),
    get: (id: number) => request<ServiceOrder>(`/api/service-orders/${id}`),
    create: (input: ServiceOrderInput) => request<ServiceOrder>("/api/service-orders", { method: "POST", body: JSON.stringify(input) }),
    update: (id: number, input: ServiceOrderInput) =>
      request<ServiceOrder>(`/api/service-orders/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/service-orders/${id}`, { method: "DELETE" }),
  },
  report: (kind: "payables" | "receivables", params: URLSearchParams) =>
    request<ReportResult>(`/api/reports/${kind}?${params.toString()}`),
  backups: {
    list: () => request<BackupList>("/api/backups"),
    create: () => request<BackupFileInfo>("/api/backups", { method: "POST" }),
    restore: (fileName: string) => request<{ ok: true }>(`/api/backups/${encodeURIComponent(fileName)}/restore`, { method: "POST" }),
    download: (fileName: string) => downloadBlob(`/api/backups/${encodeURIComponent(fileName)}/download`, fileName),
    exportJson: () => downloadBlob("/api/backups/export", "servios-backup.json"),
    importJson: (payload: BackupPayload | unknown) => request<{ ok: true }>("/api/backups/import", { method: "POST", body: JSON.stringify(payload) }),
  },
};
