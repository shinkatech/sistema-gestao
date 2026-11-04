import { PAYMENT_METHODS } from "@shared/constants";
import { formatOrderNumber, roundMoney } from "@shared/format";
import type { Client, ServiceOrderItemInput, Vehicle } from "@shared/types";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api";
import { useFeedback } from "@/components/Feedback";
import { Alert, Button, MoneyInput, SelectField } from "@/components/ui";
import { useDirtyBaseline } from "@/hooks/useDirty";
import { emitData, useOnData } from "@/lib/events";
import { errorMessage, formatDate, formatMoney, todayISO } from "@/lib/format";
import { useWorkspace } from "@/workspace/WorkspaceContext";

type DraftItem = {
  key: string;
  filterCode: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
};

type Draft = {
  clientId: string;
  vehicleId: string;
  paymentMethod: string;
  items: DraftItem[];
  createReceivable: boolean;
  receivableDueDate: string;
};

const emptyItem = (): DraftItem => ({
  key: crypto.randomUUID(),
  filterCode: "",
  productCode: "",
  quantity: 1,
  unitPrice: 0,
});

const emptyDraft = (): Draft => ({
  clientId: "",
  vehicleId: "",
  paymentMethod: "",
  items: [emptyItem()],
  createReceivable: false,
  receivableDueDate: todayISO(),
});

const draftKey = (tabId: string) => `servios-os-draft-${tabId}`;

const readDraft = (tabId: string): Draft | null => {
  const raw = sessionStorage.getItem(draftKey(tabId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      ...emptyDraft(),
      ...parsed,
      items: parsed.items.length > 0 ? parsed.items : [emptyItem()],
    };
  } catch {
    return null;
  }
};

const lineTotal = (item: DraftItem) => roundMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));

export const ServiceOrderForm = ({ tabId, orderId }: { tabId: string; orderId: number | null }) => {
  const { openSingleton, updateTab } = useWorkspace();
  const { notify } = useFeedback();
  const initialOrderId = useRef(orderId);
  const receivableTouched = useRef(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [savedId, setSavedId] = useState<number | null>(orderId);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState(todayISO());
  const [receivableId, setReceivableId] = useState<number | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const snapshot = JSON.stringify(draft);
  const { markClean } = useDirtyBaseline(tabId, ready, snapshot);

  const loadLists = async () => {
    const [nextClients, nextVehicles, settings] = await Promise.all([api.clients.list(), api.vehicles.list(), api.settings.get()]);
    setClients(nextClients);
    setVehicles(nextVehicles);
    setCompanyName(settings.companyName);
  };

  useOnData("clients", () => {
    void loadLists().catch(() => undefined);
  });
  useOnData("vehicles", () => {
    void loadLists().catch(() => undefined);
  });
  useOnData("settings", () => {
    void api.settings.get().then((settings) => setCompanyName(settings.companyName)).catch(() => undefined);
  });

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        await loadLists();
        if (!active) return;
        if (initialOrderId.current == null) {
          const stored = readDraft(tabId);
          if (stored) setDraft(stored);
          setReady(true);
          return;
        }
        const order = await api.orders.get(initialOrderId.current);
        if (!active) return;
        setDraft({
          clientId: String(order.clientId),
          vehicleId: String(order.vehicleId),
          paymentMethod: order.paymentMethod,
          items: order.items.map((item) => ({
            key: `item-${item.id}`,
            filterCode: item.filterCode,
            productCode: item.productCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          createReceivable: false,
          receivableDueDate: todayISO(),
        });
        setOrderNumber(order.number);
        setCreatedAt(order.createdAt);
        setReceivableId(order.receivableId);
        setSavedId(order.id);
        setReady(true);
      } catch (caught) {
        if (!active) return;
        setError(errorMessage(caught));
        setReady(true);
      }
    };
    void start();
    return () => {
      active = false;
    };
  }, [tabId]);

  useEffect(() => {
    if (!ready || savedId != null) {
      if (savedId != null) sessionStorage.removeItem(draftKey(tabId));
      return;
    }
    sessionStorage.setItem(draftKey(tabId), snapshot);
  }, [ready, savedId, snapshot, tabId]);

  const clientVehicles = useMemo(
    () => vehicles.filter((vehicle) => String(vehicle.clientId) === draft.clientId),
    [draft.clientId, vehicles],
  );
  const selectedVehicle = clientVehicles.find((vehicle) => String(vehicle.id) === draft.vehicleId) ?? null;
  const total = roundMoney(draft.items.reduce((sum, item) => sum + lineTotal(item), 0));

  const patch = (partial: Partial<Draft>) => setDraft((current) => ({ ...current, ...partial }));

  const handleClient = (clientId: string) => {
    const owned = vehicles.filter((vehicle) => String(vehicle.clientId) === clientId);
    const stillValid = owned.some((vehicle) => String(vehicle.id) === draft.vehicleId);
    patch({
      clientId,
      vehicleId: stillValid ? draft.vehicleId : owned.length === 1 ? String(owned[0].id) : "",
    });
  };

  const handlePayment = (paymentMethod: string) => {
    const suggested = paymentMethod === "Crediário" || paymentMethod === "Boleto";
    patch({
      paymentMethod,
      createReceivable: receivableTouched.current ? draft.createReceivable : suggested,
    });
  };

  const handleItem = (key: string, partial: Partial<DraftItem>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, ...partial } : item)),
    }));
  };

  const handleSave = async () => {
    const items: ServiceOrderItemInput[] = draft.items
      .map((item) => ({
        filterCode: item.filterCode.trim(),
        productCode: item.productCode.trim(),
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
      }))
      .filter((item) => item.filterCode || item.productCode || item.unitPrice > 0 || item.quantity !== 1);

    if (!draft.clientId) {
      setError("Selecione o cliente.");
      return;
    }
    if (!draft.vehicleId) {
      setError("Selecione o veículo.");
      return;
    }
    if (!draft.paymentMethod) {
      setError("Selecione a forma de pagamento.");
      return;
    }
    if (items.length === 0) {
      setError("Adicione pelo menos um item.");
      return;
    }
    if (draft.createReceivable && !receivableId && !draft.receivableDueDate) {
      setError("Informe o vencimento da conta a receber.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        clientId: Number(draft.clientId),
        vehicleId: Number(draft.vehicleId),
        paymentMethod: draft.paymentMethod,
        items,
        createReceivable: draft.createReceivable && receivableId == null,
        receivableDueDate: draft.receivableDueDate,
      };
      const saved = savedId == null ? await api.orders.create(payload) : await api.orders.update(savedId, payload);
      setSavedId(saved.id);
      setOrderNumber(saved.number);
      setCreatedAt(saved.createdAt);
      setReceivableId(saved.receivableId);
      updateTab(tabId, {
        title: `OS ${formatOrderNumber(saved.number)}`,
        orderId: saved.id,
        dedupeKey: `order-${saved.id}`,
      });
      markClean(snapshot);
      emitData("orders", saved.receivableId ? "receivables" : "orders");
      notify(savedId == null ? "Ordem de serviço salva." : "Ordem de serviço atualizada.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {companyName ? <p className="text-sm font-medium text-copper">{companyName}</p> : null}
              <h1 className="font-display text-2xl font-semibold tracking-tight">Ordem de serviço</h1>
              <p className="mt-1 text-sm text-muted">
                {orderNumber ? `Nº ${formatOrderNumber(orderNumber)}` : "Número gerado ao salvar"} · {formatDate(createdAt)}
              </p>
            </div>
            <div className="no-print flex gap-2">
              <Button variant="secondary" onClick={handlePrint}>
                <Printer size={16} aria-hidden="true" />
                Imprimir
              </Button>
            </div>
          </header>
          {error ? <Alert>{error}</Alert> : null}
          <section className="card grid gap-4 p-4 md:grid-cols-2">
            <SelectField
              id={`${tabId}-client`}
              label="Cliente"
              required
              value={draft.clientId}
              onChange={handleClient}
              options={clients.map((client) => ({ value: String(client.id), label: client.name }))}
              placeholder={clients.length === 0 ? "Nenhum cliente cadastrado" : "Selecione o cliente"}
            />
            <SelectField
              id={`${tabId}-vehicle`}
              label="Veículo"
              required
              value={draft.vehicleId}
              onChange={(vehicleId) => patch({ vehicleId })}
              options={clientVehicles.map((vehicle) => ({ value: String(vehicle.id), label: `${vehicle.plate} · ${vehicle.model}` }))}
              placeholder={draft.clientId ? "Selecione o veículo" : "Escolha o cliente primeiro"}
            />
            <div className="rounded-xl bg-stone-100 px-3 py-2">
              <p className="text-xs text-muted">Placa</p>
              <p className="font-medium tabular-nums">{selectedVehicle?.plate ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-stone-100 px-3 py-2">
              <p className="text-xs text-muted">Veículo</p>
              <p className="font-medium">{selectedVehicle?.model ?? "—"}</p>
            </div>
            <SelectField
              id={`${tabId}-payment`}
              label="Forma de pagamento"
              required
              value={draft.paymentMethod}
              onChange={handlePayment}
              options={PAYMENT_METHODS.map((method) => ({ value: method, label: method }))}
            />
            <div className="flex items-end">
              {clients.length === 0 ? (
                <Button variant="secondary" onClick={() => openSingleton("clients", "Clientes")}>
                  Cadastrar cliente
                </Button>
              ) : null}
              {draft.clientId && clientVehicles.length === 0 ? (
                <Button variant="secondary" onClick={() => openSingleton("vehicles", "Veículos")}>
                  Cadastrar veículo
                </Button>
              ) : null}
            </div>
            {receivableId ? (
              <p className="text-sm text-muted md:col-span-2">Já existe uma conta a receber lançada para esta ordem.</p>
            ) : (
              <div className="md:col-span-2 flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-sm" htmlFor={`${tabId}-receivable`}>
                  <input
                    id={`${tabId}-receivable`}
                    type="checkbox"
                    checked={draft.createReceivable}
                    onChange={(event) => {
                      receivableTouched.current = true;
                      patch({ createReceivable: event.target.checked });
                    }}
                  />
                  Gerar conta a receber
                </label>
                {draft.createReceivable ? (
                  <label className="block" htmlFor={`${tabId}-due`}>
                    <span className="field-label">Vencimento</span>
                    <input
                      id={`${tabId}-due`}
                      type="date"
                      className="field-input"
                      value={draft.receivableDueDate}
                      onChange={(event) => patch({ receivableDueDate: event.target.value })}
                    />
                  </label>
                ) : null}
              </div>
            )}
          </section>
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-medium">Produtos e peças</h2>
              <Button
                variant="secondary"
                className="no-print"
                onClick={() => patch({ items: [...draft.items, emptyItem()] })}
              >
                <Plus size={16} aria-hidden="true" />
                Adicionar item
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código do filtro</th>
                    <th className="px-3 py-2 font-medium">Código do produto</th>
                    <th className="px-3 py-2 font-medium">Qtd.</th>
                    <th className="px-3 py-2 font-medium">Valor unitário</th>
                    <th className="px-3 py-2 text-right font-medium">Valor total</th>
                    <th className="no-print px-3 py-2 font-medium">
                      <span className="sr-only">Remover</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, index) => (
                    <tr key={item.key} className="border-t border-line">
                      <td className="px-3 py-2">
                        <input
                          className="field-input"
                          aria-label={`Código do filtro, item ${index + 1}`}
                          value={item.filterCode}
                          maxLength={40}
                          onChange={(event) => handleItem(item.key, { filterCode: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.preventDefault();
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="field-input"
                          aria-label={`Código do produto, item ${index + 1}`}
                          value={item.productCode}
                          maxLength={40}
                          onChange={(event) => handleItem(item.key, { productCode: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.preventDefault();
                          }}
                        />
                      </td>
                      <td className="w-24 px-3 py-2">
                        <input
                          className="field-input tabular-nums"
                          aria-label={`Quantidade, item ${index + 1}`}
                          type="number"
                          min={0}
                          step="1"
                          value={item.quantity}
                          onWheel={(event) => event.currentTarget.blur()}
                          onChange={(event) => handleItem(item.key, { quantity: Number(event.target.value) })}
                        />
                      </td>
                      <td className="w-40 px-3 py-2">
                        <MoneyInput
                          id={`${tabId}-price-${item.key}`}
                          label=""
                          ariaLabel={`Valor unitário, item ${index + 1}`}
                          value={item.unitPrice}
                          onChange={(unitPrice) => handleItem(item.key, { unitPrice })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(lineTotal(item))}</td>
                      <td className="no-print px-3 py-2 text-right">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-stone-500 hover:bg-red-50 hover:text-red-800"
                          aria-label={`Remover item ${index + 1}`}
                          onClick={() =>
                            patch({
                              items: draft.items.length === 1 ? [emptyItem()] : draft.items.filter((current) => current.key !== item.key),
                            })
                          }
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
      <footer className="border-t border-line bg-card px-5 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Total da ordem</p>
            <p className="font-display text-2xl font-semibold tabular-nums" aria-live="polite">
              {formatMoney(total)}
            </p>
          </div>
          <Button className="no-print" onClick={() => void handleSave()} disabled={saving || !ready}>
            {saving ? "Salvando..." : "Salvar ordem"}
          </Button>
        </div>
      </footer>
    </div>
  );
};
