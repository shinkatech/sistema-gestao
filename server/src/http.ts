import type { Request, RequestHandler, Response } from "express";
import { isPaymentMethod } from "../../shared/constants";
import { isValidCnpj, isValidPlate, normalizePlate, onlyDigits, roundMoney } from "../../shared/format";
import type { ServiceOrderItemInput } from "../../shared/types";
import { enqueue } from "./lock";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    enqueue(() => handler(req, res)).catch(next);
  };

export const bodyOf = (req: Request) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new HttpError(400, "Dados inválidos.");
  }
  return req.body as Record<string, unknown>;
};

export const routeId = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) throw new HttpError(400, "Identificador inválido.");
  return Number(raw);
};

export const requiredText = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string") throw new HttpError(400, `${label} é obrigatório.`);
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(400, `${label} é obrigatório.`);
  if (trimmed.length > max) throw new HttpError(400, `${label} deve ter no máximo ${max} caracteres.`);
  return trimmed;
};

export const optionalText = (value: unknown, label: string, max: number) => {
  if (value == null) return "";
  if (typeof value !== "string") throw new HttpError(400, `${label} inválido.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${label} deve ter no máximo ${max} caracteres.`);
  return trimmed;
};

export const parseCep = (value: unknown) => {
  const text = requiredText(value, "CEP", 9);
  const digits = onlyDigits(text);
  if (digits.length !== 8) throw new HttpError(400, "CEP deve ter 8 dígitos.");
  return digits;
};

export const parseCnpj = (value: unknown) => {
  const text = requiredText(value, "CNPJ", 18);
  if (!isValidCnpj(text)) throw new HttpError(400, "CNPJ inválido.");
  return onlyDigits(text);
};

export const parsePlate = (value: unknown) => {
  const plate = normalizePlate(requiredText(value, "Placa", 8));
  if (!isValidPlate(plate)) throw new HttpError(400, "Placa inválida. Use o padrão antigo ou Mercosul.");
  return plate;
};

export const parseDate = (value: unknown, label: string) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${label} inválida.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new HttpError(400, `${label} inválida.`);
  }
  return value;
};

export const parseId = (value: unknown, label: string) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(400, `${label} inválido.`);
  return number;
};

export const parseMoney = (value: unknown, label: string) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 9_999_999.99) {
    throw new HttpError(400, `${label} deve ser maior que zero.`);
  }
  return roundMoney(number);
};

export const parsePaymentMethod = (value: unknown) => {
  const text = requiredText(value, "Forma de pagamento", 40);
  if (!isPaymentMethod(text)) throw new HttpError(400, "Forma de pagamento inválida.");
  return text;
};

const parseQuantity = (value: unknown, index: number) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 9999) {
    throw new HttpError(400, `Quantidade inválida no item ${index + 1}.`);
  }
  return roundMoney(number);
};

export const parseItems = (value: unknown): Array<ServiceOrderItemInput & { total: number }> => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "Adicione pelo menos um item na ordem de serviço.");
  }
  if (value.length > 80) throw new HttpError(400, "A ordem de serviço aceita no máximo 80 itens.");

  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new HttpError(400, `Item ${index + 1} inválido.`);
    const row = item as Record<string, unknown>;
    const filterCode = optionalText(row.filterCode, `Código do filtro do item ${index + 1}`, 40);
    const productCode = optionalText(row.productCode, `Código do produto do item ${index + 1}`, 40);
    if (!filterCode && !productCode) {
      throw new HttpError(400, `Informe o código do filtro ou do produto no item ${index + 1}.`);
    }
    const quantity = parseQuantity(row.quantity, index);
    const unitPrice = parseMoney(row.unitPrice, `Valor unitário do item ${index + 1}`);
    return {
      filterCode,
      productCode,
      quantity,
      unitPrice,
      total: roundMoney(quantity * unitPrice),
    };
  });
};

export const rethrowDb = (error: unknown, uniqueMessage: string): never => {
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    throw new HttpError(409, uniqueMessage);
  }
  if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed")) {
    throw new HttpError(409, "Este registro está vinculado a outros dados e não pode ser excluído.");
  }
  throw error;
};
