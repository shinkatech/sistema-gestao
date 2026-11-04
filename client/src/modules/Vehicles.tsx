import type { Client, Vehicle } from "@shared/types";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { useFeedback } from "@/components/Feedback";
import { Alert, Button, EmptyState, Screen, SelectField, TextField } from "@/components/ui";
import { useDirtyBaseline } from "@/hooks/useDirty";
import { emitData, useOnData } from "@/lib/events";
import { errorMessage, fold, normalizePlate } from "@/lib/format";
import { useWorkspace } from "@/workspace/WorkspaceContext";

type Mode = "idle" | "create" | "edit";

export const VehiclesScreen = ({ tabId }: { tabId: string }) => {
  const { confirm, notify } = useFeedback();
  const { openSingleton } = useWorkspace();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const snapshot = mode === "idle" ? "idle" : JSON.stringify({ mode, editingId, plate, model, clientId });
  const { markClean, isDirty } = useDirtyBaseline(tabId, !loading, snapshot);

  const load = async () => {
    try {
      const [nextVehicles, nextClients] = await Promise.all([api.vehicles.list(), api.clients.list()]);
      setVehicles(nextVehicles);
      setClients(nextClients);
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

  useOnData("vehicles", () => void load());
  useOnData("clients", () => void load());

  const filtered = vehicles.filter((vehicle) => fold(`${vehicle.plate} ${vehicle.model} ${vehicle.clientName}`).includes(fold(search)));

  const discardIfNeeded = async () => {
    if (!isDirty()) return true;
    return confirm({
      title: "Alterações não salvas",
      message: "Deseja descartar o que está preenchido neste cadastro?",
      confirmLabel: "Descartar",
      danger: true,
    });
  };

  const apply = (nextMode: Mode, vehicle?: Vehicle) => {
    const next = {
      mode: nextMode,
      editingId: vehicle?.id ?? null,
      plate: vehicle?.plate ?? "",
      model: vehicle?.model ?? "",
      clientId: vehicle ? String(vehicle.clientId) : "",
    };
    setMode(next.mode);
    setEditingId(next.editingId);
    setPlate(next.plate);
    setModel(next.model);
    setClientId(next.clientId);
    setError("");
    markClean(nextMode === "idle" ? "idle" : JSON.stringify(next));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const input = { plate, model, clientId: Number(clientId) };
      const saved = editingId == null ? await api.vehicles.create(input) : await api.vehicles.update(editingId, input);
      emitData("vehicles");
      notify(editingId == null ? "Veículo cadastrado." : "Veículo atualizado.");
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
      title: "Excluir veículo",
      message: "O veículo só pode ser excluído se não houver ordem de serviço vinculada.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!accepted) return;
    try {
      await api.vehicles.remove(editingId);
      emitData("vehicles");
      notify("Veículo excluído.");
      apply("idle");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <Screen title="Veículos" description="Placa, modelo e o cliente dono do veículo." fill>
      {error && mode === "idle" ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="card flex min-h-80 flex-col overflow-hidden">
          <div className="border-b border-line p-3">
            <input className="field-input" placeholder="Buscar placa, modelo ou cliente" aria-label="Buscar veículo" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? <p className="p-4 text-sm text-muted">Carregando...</p> : null}
            {!loading && filtered.length === 0 ? <p className="p-4 text-sm text-muted">Nenhum veículo encontrado.</p> : null}
            {filtered.map((vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                className={`block w-full border-b border-line px-3 py-3 text-left hover:bg-orange-50/60 ${editingId === vehicle.id ? "bg-orange-50" : ""}`}
                onClick={() => void (async () => {
                  if (!(await discardIfNeeded())) return;
                  apply("edit", vehicle);
                })()}
              >
                <span className="block font-medium tabular-nums">{vehicle.plate}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {vehicle.model} · {vehicle.clientName}
                </span>
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
              Novo veículo
            </Button>
          </div>
        </section>
        <section className="card min-h-80 overflow-auto p-4">
          {mode === "idle" ? (
            <EmptyState title="Nenhum veículo selecionado" description="Vincule cada veículo a um cliente já cadastrado." />
          ) : (
            <form
              className="mx-auto flex max-w-xl flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <h2 className="font-display text-lg font-semibold">{mode === "create" ? "Novo veículo" : "Editar veículo"}</h2>
              {error ? <Alert>{error}</Alert> : null}
              {clients.length === 0 ? (
                <Button variant="secondary" onClick={() => openSingleton("clients", "Clientes")}>
                  Cadastrar cliente
                </Button>
              ) : null}
              <SelectField
                id={`${tabId}-client`}
                label="Cliente"
                required
                value={clientId}
                onChange={setClientId}
                options={clients.map((client) => ({ value: String(client.id), label: client.name }))}
              />
              <TextField id={`${tabId}-plate`} label="Placa" required maxLength={7} value={plate} onChange={(value) => setPlate(normalizePlate(value))} />
              <TextField id={`${tabId}-model`} label="Modelo do veículo" required maxLength={80} value={model} onChange={setModel} />
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
