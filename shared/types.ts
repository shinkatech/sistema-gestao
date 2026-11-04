export type Client = {
  id: number;
  name: string;
  address: string;
  zipCode: string;
  createdAt: string;
};

export type ClientInput = {
  name: string;
  address: string;
  zipCode: string;
};

export type Vehicle = {
  id: number;
  plate: string;
  model: string;
  clientId: number;
  clientName: string;
  createdAt: string;
};

export type VehicleInput = {
  plate: string;
  model: string;
  clientId: number;
};

export type Supplier = {
  id: number;
  cnpj: string;
  name: string;
  address: string;
  zipCode: string;
  createdAt: string;
};

export type SupplierInput = {
  cnpj: string;
  name: string;
  address: string;
  zipCode: string;
};

export type ServiceOrderItem = {
  id: number;
  filterCode: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ServiceOrderItemInput = {
  filterCode: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
};

export type ServiceOrder = {
  id: number;
  number: number;
  clientId: number;
  vehicleId: number;
  plate: string;
  clientName: string;
  vehicle: string;
  paymentMethod: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  items: ServiceOrderItem[];
  receivableId: number | null;
};

export type ServiceOrderSummary = Omit<ServiceOrder, "items">;

export type ServiceOrderInput = {
  clientId: number;
  vehicleId: number;
  paymentMethod: string;
  items: ServiceOrderItemInput[];
  createReceivable: boolean;
  receivableDueDate?: string;
};

export type Payable = {
  id: number;
  description: string;
  supplierId: number;
  supplierName: string;
  amount: number;
  dueDate: string;
  paymentDate: string | null;
  status: "pendente" | "pago";
  createdAt: string;
};

export type PayableInput = {
  description: string;
  supplierId: number;
  amount: number;
  dueDate: string;
  paymentDate: string | null;
  status: "pendente" | "pago";
};

export type Receivable = {
  id: number;
  description: string;
  clientId: number;
  clientName: string;
  serviceOrderId: number | null;
  serviceOrderNumber: number | null;
  amount: number;
  dueDate: string;
  receivedDate: string | null;
  status: "pendente" | "recebido";
  createdAt: string;
};

export type ReceivableInput = {
  description: string;
  clientId: number;
  amount: number;
  dueDate: string;
  receivedDate: string | null;
  status: "pendente" | "recebido";
};

export type DashboardSummary = {
  clients: number;
  vehicles: number;
  suppliers: number;
  serviceOrders: number;
  pendingPayables: number;
  pendingPayablesAmount: number;
  pendingReceivables: number;
  pendingReceivablesAmount: number;
  dueTodayPayablesAmount: number;
  dueTodayReceivablesAmount: number;
  recentOrders: Array<{
    id: number;
    number: number;
    clientName: string;
    plate: string;
    vehicle: string;
    total: number;
    createdAt: string;
  }>;
};

export type ReportBasis = "due" | "settlement";
export type ReportMode = "month" | "day" | "range";

export type ReportRow = {
  id: number;
  description: string;
  partyName: string;
  amount: number;
  dueDate: string;
  settlementDate: string | null;
  status: string;
};

export type ReportResult = {
  from: string;
  to: string;
  rows: ReportRow[];
  count: number;
  total: number;
  pendingTotal: number;
  settledTotal: number;
};

export type Settings = {
  companyName: string;
};

export type BackupFileInfo = {
  fileName: string;
  createdAt: string;
  size: number;
};

export type BackupList = {
  directory: string;
  files: BackupFileInfo[];
};

export type BackupPayload = {
  version: 1;
  createdAt: string;
  companyName: string;
  clients: Client[];
  vehicles: Vehicle[];
  suppliers: Supplier[];
  serviceOrders: ServiceOrder[];
  payables: Payable[];
  receivables: Receivable[];
};
