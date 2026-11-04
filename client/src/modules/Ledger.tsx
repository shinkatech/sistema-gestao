import type { Payable, PayableInput, Receivable, ReceivableInput } from "@shared/types";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { useFeedback } from "@/components/Feedback";
import { Alert, Button, EmptyState, MoneyInput, Screen, SelectField, StatusBadge, TextField } from "@/components/ui";
import { useDirtyBaseline } from "@/hooks/useDirty";
import { emitData, useOnData, type DataTopic } from "@/lib/events";
import { errorMessage, fold, formatDate, formatMoney, formatOrderNumber, isOverdue, todayISO } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/workspace/WorkspaceContext";

type LedgerKind = "payables" | "receivables";
type Mode = "idle" | "create" | "edit";

type LedgerRow = {
  id: number;
  description: string;
  partyId: number;
  partyName: string;
  amount: number;
  dueDate: string;
  settledDate: string | null;
  status: string;
  serviceOrderId: number | null;
  serviceOrderNumber: number | null;
};

type FormState = {
  description: string;
  partyId: string;
  amount: number;
  dueDate: string;
  settledDate: string;
  status: string;
};

const emptyForm = (): FormState => ({
  description: "",
  partyId: "",
  amount: 0,
  dueDate: todayISO(),
  settledDate: "",
  status: "pendente",
});

const fromPayable = (row: Payable): LedgerRow => ({
  id: row.id,
  description: row.description,
  partyId: row.supplierId,
  partyName: row.supplierName,
  amount: row.amount,
  dueDate: row.dueDate,
  settledDate: row.paymentDate,
  status: row.status,
  serviceOrderId: null,
  serviceOrderNumber: null,
});

const fromReceivable = (row: Receivable): LedgerRow => ({
  id: row.id,
  description: row.description,
  partyId: row.clientId,
  partyName: row.clientName,
  amount: row.amount,
  dueDate: row.dueDate,
  settledDate: row.receivedDate,
  status: row.status,
  serviceOrderId: row.serviceOrderId,
  serviceOrderNumber: row.serviceOrderNumber,
});

export const Ledger = ({ tabId, kind }: { tabId: string; kind: LedgerKind }) => {
  const payable = kind === "payables";
  const topic: DataTopic = payable ? "payables" : "receivables";
  const partyTopic: DataTopic = payable ? "suppliers" : "clients";
  const settledStatus = payable ? "pago" : "recebido";
  const settledLabel = payable ? "Pago" : "Recebido";
  const dateLabel = payable ? "Data de pagamento" : "Data de recebimento";
  const partyLabel = payable ? "Fornecedor" : "Cliente";
  const { confirm, notify } = useFeedback();
  const { openOrder, openSingleton } = useWorkspace();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [parties, setParties] = useState<Array<{ id: number; label: string }>>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [mode, setMode] = useState<Mode>("idle");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [linkedOrder, setLinkedOrder] = useState<{ id: number; number: number } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const snapshot = mode === "idle" ? "idle" : JSON.stringify({ mode, editingId, form });
  const { markClean, isDirty } = useDirtyBaseline(tabId, !loading, snapshot);

  const load = async () => {
    try {
      if (payable) {
        const [records, suppliers] = await Promise.all([api.payables.list(), api.suppliers.list()]);
        setRows(records.map(fromPayable));
        setParties(suppliers.map((item) => ({ id: item.id, label: item.name })));
      } else {
        const [records, clients] = await Promise.all([api.receivables.list(), api.clients.list()]);
        setRows(records.map(fromReceivable));
        setParties(clients.map((item) => ({ id: item.id, label: item.name })));
      }
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [kind]);

  useOnData(topic, () => void load());
  useOnData(partyTopic, () => void load());

  const filtered = rows.filter((row) => {
    const matchesStatus = statusFilter === "todas" || row.status === statusFilter;
    const matchesSearch = fold(`${row.description} ${row.partyName}`).includes(fold(search));
    return matchesStatus && matchesSearch;
  });

  const discardIfNeeded = async () => {
    if (!isDirty()) return true;
    return confirm({
      title: "Alterações não salvas",
      message: "Deseja descartar o que está preenchido nesta conta?",
      confirmLabel: "Descartar",
      danger: true,
    });
  };

  const apply = (nextMode: Mode, row?: LedgerRow) => {
    const nextForm: FormState = row
      ? {
          description: row.description,
          partyId: String(row.partyId),
          amount: row.amount,
          dueDate: row.dueDate,
          settledDate: row.settledDate ?? "",
          status: row.status,
        }
      : emptyForm();
    const nextId = row?.id ?? null;
    setMode(nextMode);
    setEditingId(nextId);
    setForm(nextForm);
    setLinkedOrder(row?.serviceOrderId && row.serviceOrderNumber ? { id: row.serviceOrderId, number: row.serviceOrderNumber } : null);
    setError("");
    markClean(nextMode === "idle" ? "idle" : JSON.stringify({ mode: nextMode, editingId: nextId, form: nextForm }));
  };

  const handleStatus = (status: string) => {
    setForm((current) => ({
      ...current,
      status,
      settledDate: status === settledStatus ? current.settledDate || todayISO() : "",
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      if (payable) {
        const input: PayableInput = {
          description: form.description,
          supplierId: Number(form.partyId),
          amount: form.amount,
          dueDate: form.dueDate,
          paymentDate: form.status === "pago" ? form.settledDate : null,
          status: form.status === "pago" ? "pago" : "pendente",
        };
        const saved = editingId == null ? await api.payables.create(input) : await api.payables.update(editingId, input);
        emitData("payables");
        apply("edit", fromPayable(saved));
      } else {
        const input: ReceivableInput = {
          description: form.description,
          clientId: Number(form.partyId),
          amount: form.amount,
          dueDate: form.dueDate,
          receivedDate: form.status === "recebido" ? form.settledDate : null,
          status: form.status === "recebido" ? "recebido" : "pendente",
        };
        const saved = editingId == null ? await api.receivables.create(input) : await api.receivables.update(editingId, input);
        emitData("receivables");
        apply("edit", fromReceivable(saved));
      }
      notify(editingId == null ? "Conta lançada." : "Conta atualizada.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (editingId == null) return;
    const accepted = await confirm({
      title: "Excluir conta",
      message: "Essa conta será removida do financeiro.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!accepted) return;
    try {
      if (payable) await api.payables.remove(editingId);
      else await api.receivables.remove(editingId);
      emitData(topic);
      notify("Conta excluída.");
      apply("idle");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const handleToggle = async (row: LedgerRow) => {
    if (isDirty() && editingId === row.id) {
      notify("Salve ou cancele a edição antes de mudar a situação por aqui.", "error");
      return;
    }
    const nextStatus = row.status === settledStatus ? "pendente" : settledStatus;
    try {
      if (payable) {
        const saved = await api.payables.update(row.id, {
          description: row.description,
          supplierId: row.partyId,
          amount: row.amount,
          dueDate: row.dueDate,
          status: nextStatus === "pago" ? "pago" : "pendente",
          paymentDate: nextStatus === "pago" ? row.settledDate || todayISO() : null,
        });
        if (editingId === row.id) apply("edit", fromPayable(saved));
      } else {
        const saved = await api.receivables.update(row.id, {
          description: row.description,
          clientId: row.partyId,
          amount: row.amount,
          dueDate: row.dueDate,
          status: nextStatus === "recebido" ? "recebido" : "pendente",
          receivedDate: nextStatus === "recebido" ? row.settledDate || todayISO() : null,
        });
        if (editingId === row.id) apply("edit", fromReceivable(saved));
      }
      emitData(topic);
      notify(nextStatus === settledStatus ? `Conta marcada como ${settledLabel.toLowerCase()}.` : "Conta marcada como pendente.");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  return (
    <Screen
      title={payable ? "Contas a pagar" : "Contas a receber"}
      description={payable ? "Despesas e compromissos com fornecedores." : "Valores que a oficina ainda tem para receber."}
      fill
    >
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <section className="card flex min-h-80 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <input
              className="field-input max-w-xs"
              placeholder="Buscar descrição ou nome"
              aria-label="Buscar conta"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {[
              ["todas", "Todas"],
              ["pendente", "Pendentes"],
              [settledStatus, payable ? "Pagas" : "Recebidas"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn("rounded-full px-3 py-1 text-sm", statusFilter === value ? "bg-ink text-white" : "bg-stone-100 text-ink")}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? <p className="p-4 text-sm text-muted">Carregando...</p> : null}
            {error && mode === "idle" ? (
              <div className="p-3">
                <Alert>{error}</Alert>
              </div>
            ) : null}
            {!loading && filtered.length === 0 ? <p className="p-4 text-sm text-muted">Nenhuma conta encontrada.</p> : null}
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">{partyLabel}</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className={cn("cursor-pointer border-t border-line hover:bg-orange-50/50", editingId === row.id && "bg-orange-50")}
                    onClick={() => void (async () => {
                      if (!(await discardIfNeeded())) return;
                      apply("edit", row);
                    })()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void (async () => {
                          if (!(await discardIfNeeded())) return;
                          apply("edit", row);
                        })();
                      }
                    }}
                  >
                    <td className="px-3 py-3">
                      <span className="block font-medium">{row.description}</span>
                      {row.serviceOrderNumber ? (
                        <button
                          type="button"
                          className="text-xs text-copper hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            openOrder(row.serviceOrderId!, row.serviceOrderNumber!);
                          }}
                        >
                          OS {formatOrderNumber(row.serviceOrderNumber)}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{row.partyName}</td>
                    <td className={cn("px-3 py-3", isOverdue(row.dueDate, row.status) && "font-medium text-red-800")}>
                      {formatDate(row.dueDate)}
                      {isOverdue(row.dueDate, row.status) ? " · vencida" : ""}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(row.amount)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        aria-label={row.status === settledStatus ? "Marcar como pendente" : `Marcar como ${settledLabel.toLowerCase()}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggle(row);
                        }}
                      >
                        <StatusBadge status={row.status} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card min-h-80 overflow-auto p-4">
          {mode === "idle" ? (
            <EmptyState
              title="Nenhuma conta selecionada"
              description="Lance uma despesa ou um valor a receber."
              action={<Button onClick={() => apply("create")}>Nova conta</Button>}
            />
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{mode === "create" ? "Nova conta" : "Editar conta"}</h2>
                <Button
                  variant="secondary"
                  onClick={() => void (async () => {
                    if (!(await discardIfNeeded())) return;
                    apply("create");
                  })()}
                >
                  Nova
                </Button>
              </div>
              {error ? <Alert>{error}</Alert> : null}
              {parties.length === 0 ? (
                <Button variant="secondary" onClick={() => openSingleton(payable ? "suppliers" : "clients", payable ? "Fornecedores" : "Clientes")}>
                  {payable ? "Cadastrar fornecedor" : "Cadastrar cliente"}
                </Button>
              ) : null}
              {linkedOrder ? (
                <button type="button" className="text-left text-sm text-copper hover:underline" onClick={() => openOrder(linkedOrder.id, linkedOrder.number)}>
                  Originada da OS {formatOrderNumber(linkedOrder.number)}
                </button>
              ) : null}
              <TextField id={`${tabId}-description`} label="Descrição" required maxLength={160} value={form.description} onChange={(description) => setForm((current) => ({ ...current, description }))} />
              <SelectField
                id={`${tabId}-party`}
                label={partyLabel}
                required
                value={form.partyId}
                onChange={(partyId) => setForm((current) => ({ ...current, partyId }))}
                options={parties.map((party) => ({ value: String(party.id), label: party.label }))}
              />
              <MoneyInput id={`${tabId}-amount`} label="Valor" required value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
              <label className="block" htmlFor={`${tabId}-due`}>
                <span className="field-label">Data de vencimento <span className="text-copper">*</span></span>
                <input id={`${tabId}-due`} type="date" className="field-input" required value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <SelectField
                id={`${tabId}-status`}
                label="Situação"
                required
                value={form.status}
                onChange={handleStatus}
                options={[
                  { value: "pendente", label: "Pendente" },
                  { value: settledStatus, label: settledLabel },
                ]}
              />
              {form.status === settledStatus ? (
                <label className="block" htmlFor={`${tabId}-settled`}>
                  <span className="field-label">{dateLabel} <span className="text-copper">*</span></span>
                  <input
                    id={`${tabId}-settled`}
                    type="date"
                    className="field-input"
                    required
                    value={form.settledDate}
                    onChange={(event) => setForm((current) => ({ ...current, settledDate: event.target.value }))}
                  />
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void (async () => {
                    if (!(await discardIfNeeded())) return;
                    apply("idle");
                  })()}
                >
                  Cancelar
                </Button>
                {mode === "edit" ? (
                  <Button variant="ghost" onClick={() => void handleDelete()}>
                    <Trash2 size={16} aria-hidden="true" />
                    Excluir
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </section>
      </div>
    </Screen>
  );
};
