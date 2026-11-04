import type { Client } from "@shared/types";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { useFeedback } from "@/components/Feedback";
import { Alert, AreaField, Button, EmptyState, Screen, TextField } from "@/components/ui";
import { useDirtyBaseline } from "@/hooks/useDirty";
import { lookupCep } from "@/lib/cep";
import { emitData, useOnData } from "@/lib/events";
import { errorMessage, fold, formatCep, onlyDigits } from "@/lib/format";

type Mode = "idle" | "create" | "edit";

export const ClientsScreen = ({ tabId }: { tabId: string }) => {
  const { confirm, notify } = useFeedback();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const snapshot = mode === "idle" ? "idle" : JSON.stringify({ mode, editingId, name, address, zipCode });
  const { markClean, isDirty } = useDirtyBaseline(tabId, !loading, snapshot);

  const load = async () => {
    try {
      setClients(await api.clients.list());
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

  useOnData("clients", () => {
    void load();
  });

  const filtered = clients.filter((client) => fold(`${client.name} ${client.address} ${client.zipCode}`).includes(fold(search)));

  const apply = (nextMode: Mode, client?: Client) => {
    const next = {
      mode: nextMode,
      editingId: client?.id ?? null,
      name: client?.name ?? "",
      address: client?.address ?? "",
      zipCode: client?.zipCode ?? "",
    };
    setMode(next.mode);
    setEditingId(next.editingId);
    setName(next.name);
    setAddress(next.address);
    setZipCode(next.zipCode);
    setError("");
    markClean(nextMode === "idle" ? "idle" : JSON.stringify(next));
  };

  const handleSelect = async (client: Client) => {
    if (isDirty()) {
      const accepted = await confirm({
        title: "Alterações não salvas",
        message: "Deseja descartar o que está preenchido neste cadastro?",
        confirmLabel: "Descartar",
        danger: true,
      });
      if (!accepted) return;
    }
    apply("edit", client);
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
      const input = { name, address, zipCode };
      const saved = editingId == null ? await api.clients.create(input) : await api.clients.update(editingId, input);
      emitData("clients", "vehicles");
      notify(editingId == null ? "Cliente cadastrado." : "Cliente atualizado.");
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
      title: "Excluir cliente",
      message: "O cliente só pode ser excluído se não tiver veículo, ordem ou conta a receber.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!accepted) return;
    try {
      await api.clients.remove(editingId);
      emitData("clients");
      notify("Cliente excluído.");
      apply("idle");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <Screen title="Clientes" description="Nome, endereço e CEP. O CEP completa o endereço quando ele ainda está vazio." fill>
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="card flex min-h-80 flex-col overflow-hidden">
          <div className="border-b border-line p-3">
            <input
              className="field-input"
              placeholder="Buscar cliente"
              aria-label="Buscar cliente"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? <p className="p-4 text-sm text-muted">Carregando...</p> : null}
            {!loading && filtered.length === 0 ? <p className="p-4 text-sm text-muted">Nenhum cliente encontrado.</p> : null}
            {filtered.map((client) => (
              <button
                key={client.id}
                type="button"
                className={`block w-full border-b border-line px-3 py-3 text-left hover:bg-orange-50/60 ${editingId === client.id ? "bg-orange-50" : ""}`}
                onClick={() => void handleSelect(client)}
              >
                <span className="block font-medium">{client.name}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {formatCep(client.zipCode)} · {client.address}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-line p-3">
            <Button
              className="w-full"
              onClick={() => void (async () => {
                if (isDirty()) {
                  const accepted = await confirm({
                    title: "Alterações não salvas",
                    message: "Deseja descartar o que está preenchido neste cadastro?",
                    confirmLabel: "Descartar",
                    danger: true,
                  });
                  if (!accepted) return;
                }
                apply("create");
              })()}
            >
              Novo cliente
            </Button>
          </div>
        </section>
        <section className="card min-h-80 overflow-auto p-4">
          {mode === "idle" ? (
            <EmptyState title="Nenhum cliente selecionado" description="Escolha alguém na lista ou cadastre um novo." />
          ) : (
            <form
              className="mx-auto flex max-w-xl flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <h2 className="font-display text-lg font-semibold">{mode === "create" ? "Novo cliente" : "Editar cliente"}</h2>
              {error ? <Alert>{error}</Alert> : null}
              <TextField id={`${tabId}-name`} label="Nome" required maxLength={120} value={name} onChange={setName} />
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
                <Button variant="secondary" onClick={() => void (isDirty() ? handleSelectOrIdle() : apply("idle"))}>
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

  async function handleSelectOrIdle() {
    const accepted = await confirm({
      title: "Alterações não salvas",
      message: "Deseja descartar o que está preenchido neste cadastro?",
      confirmLabel: "Descartar",
      danger: true,
    });
    if (accepted) apply("idle");
  }
};
