import type { Supplier } from "@shared/types";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { useFeedback } from "@/components/Feedback";
import { Alert, AreaField, Button, EmptyState, Screen, TextField } from "@/components/ui";
import { useDirtyBaseline } from "@/hooks/useDirty";
import { lookupCep } from "@/lib/cep";
import { emitData, useOnData } from "@/lib/events";
import { errorMessage, fold, formatCep, formatCnpj, onlyDigits } from "@/lib/format";

type Mode = "idle" | "create" | "edit";

export const SuppliersScreen = ({ tabId }: { tabId: string }) => {
  const { confirm, notify } = useFeedback();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cnpj, setCnpj] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const snapshot = mode === "idle" ? "idle" : JSON.stringify({ mode, editingId, cnpj, name, address, zipCode });
  const { markClean, isDirty } = useDirtyBaseline(tabId, !loading, snapshot);

  const load = async () => {
    try {
      setSuppliers(await api.suppliers.list());
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useOnData("suppliers", () => void load());

  const filtered = suppliers.filter((supplier) => fold(`${supplier.name} ${supplier.cnpj} ${supplier.address}`).includes(fold(search)));

  const discardIfNeeded = async () => {
    if (!isDirty()) return true;
    return confirm({
      title: "Alterações não salvas",
      message: "Deseja descartar o que está preenchido neste cadastro?",
      confirmLabel: "Descartar",
      danger: true,
    });
  };

  const apply = (nextMode: Mode, supplier?: Supplier) => {
    const next = {
      mode: nextMode,
      editingId: supplier?.id ?? null,
      cnpj: supplier ? onlyDigits(supplier.cnpj) : "",
      name: supplier?.name ?? "",
      address: supplier?.address ?? "",
      zipCode: supplier?.zipCode ?? "",
    };
    setMode(next.mode);
    setEditingId(next.editingId);
    setCnpj(next.cnpj);
    setName(next.name);
    setAddress(next.address);
    setZipCode(next.zipCode);
    setError("");
    markClean(nextMode === "idle" ? "idle" : JSON.stringify(next));
  };

  const handleCepBlur = async () => {
    if (address.trim()) return;
    const result = await lookupCep(zipCode);
    if (result?.ok && result.address) setAddress(result.address);
    else if (result && !result.ok && result.missing) notify("CEP não encontrado. Preencha o endereço.", "error");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const input = { cnpj, name, address, zipCode };
      const saved = editingId == null ? await api.suppliers.create(input) : await api.suppliers.update(editingId, input);
      emitData("suppliers");
      notify(editingId == null ? "Fornecedor cadastrado." : "Fornecedor atualizado.");
      apply("edit", saved);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (editingId == null) return;
    const accepted = await confirm({
      title: "Excluir fornecedor",
      message: "O fornecedor só pode ser excluído se não houver conta a pagar vinculada.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!accepted) return;
    try {
      await api.suppliers.remove(editingId);
      emitData("suppliers");
      notify("Fornecedor excluído.");
      apply("idle");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <Screen title="Fornecedores" description="CNPJ, razão social, endereço e CEP." fill>
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="card flex min-h-80 flex-col overflow-hidden">
          <div className="border-b border-line p-3">
            <input className="field-input" placeholder="Buscar fornecedor" aria-label="Buscar fornecedor" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? <p className="p-4 text-sm text-muted">Carregando...</p> : null}
            {!loading && filtered.length === 0 ? <p className="p-4 text-sm text-muted">Nenhum fornecedor encontrado.</p> : null}
            {filtered.map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                className={`block w-full border-b border-line px-3 py-3 text-left hover:bg-orange-50/60 ${editingId === supplier.id ? "bg-orange-50" : ""}`}
                onClick={() => void (async () => {
                  if (!(await discardIfNeeded())) return;
                  apply("edit", supplier);
                })()}
              >
                <span className="block font-medium">{supplier.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{supplier.cnpj}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-line p-3">
            <Button
              className="w-full"
              onClick={() => void (async () => {
                if (!(await discardIfNeeded())) return;
                apply("create");
              })()}
            >
              Novo fornecedor
            </Button>
          </div>
        </section>
        <section className="card min-h-80 overflow-auto p-4">
          {mode === "idle" ? (
            <EmptyState title="Nenhum fornecedor selecionado" description="Cadastre quem vende peças, filtros e outros compromissos da oficina." />
          ) : (
            <form
              className="mx-auto flex max-w-xl flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <h2 className="font-display text-lg font-semibold">{mode === "create" ? "Novo fornecedor" : "Editar fornecedor"}</h2>
              {error ? <Alert>{error}</Alert> : null}
              <TextField
                id={`${tabId}-cnpj`}
                label="CNPJ"
                required
                inputMode="numeric"
                value={formatCnpj(cnpj)}
                onChange={(value) => setCnpj(onlyDigits(value).slice(0, 14))}
              />
              <TextField id={`${tabId}-name`} label="Nome ou razão social" required maxLength={140} value={name} onChange={setName} />
              <TextField
                id={`${tabId}-cep`}
                label="CEP"
                required
                inputMode="numeric"
                autoComplete="postal-code"
                value={formatCep(zipCode)}
                onChange={(value) => setZipCode(onlyDigits(value).slice(0, 8))}
                onBlur={() => void handleCepBlur()}
              />
              <AreaField id={`${tabId}-address`} label="Endereço" required maxLength={180} value={address} onChange={setAddress} />
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
