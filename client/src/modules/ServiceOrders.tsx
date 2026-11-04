import { useCallback, useEffect, useState } from "react";
import type { ServiceOrderSummary } from "@shared/types";
import { Trash2 } from "lucide-react";
import { api } from "@/api";
import { useFeedback } from "@/components/Feedback";
import { Alert, Button, Screen } from "@/components/ui";
import { emitData, useOnData } from "@/lib/events";
import { errorMessage, fold, formatDate, formatMoney, formatOrderNumber } from "@/lib/format";
import { useWorkspace } from "@/workspace/WorkspaceContext";

export const ServiceOrders = () => {
  const { openNewOrder, openOrder } = useWorkspace();
  const { confirm, notify } = useFeedback();
  const [orders, setOrders] = useState<ServiceOrderSummary[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setOrders(await api.orders.list());
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useOnData("orders", load);

  const filtered = orders.filter((order) =>
    fold(`${order.number} ${order.clientName} ${order.plate} ${order.vehicle} ${order.paymentMethod}`).includes(fold(search)),
  );

  const handleDelete = async (order: ServiceOrderSummary) => {
    const accepted = await confirm({
      title: `Excluir OS ${formatOrderNumber(order.number)}`,
      message: "A ordem será excluída. Uma conta a receber já lançada para ela permanece no financeiro.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!accepted) return;
    try {
      await api.orders.remove(order.id);
      emitData("orders");
      notify("Ordem de serviço excluída.");
    } catch (caught) {
      notify(errorMessage(caught), "error");
    }
  };

  return (
    <Screen
      title="Ordens de serviço"
      description="Consulte as OS emitidas ou abra uma nova sem fechar o que já está em andamento."
      actions={<Button onClick={openNewOrder}>Nova ordem</Button>}
    >
      <div className="mb-3">
        <label className="block max-w-sm" htmlFor="os-search">
          <span className="sr-only">Buscar ordem</span>
          <input
            id="os-search"
            className="field-input"
            placeholder="Buscar por número, cliente, placa ou veículo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <p className="text-sm text-muted">Carregando...</p> : null}
      {!loading && filtered.length === 0 ? (
        <div className="card">
          <p className="px-4 py-10 text-center text-sm text-muted">
            {orders.length === 0 ? "Nenhuma ordem de serviço cadastrada." : "Nenhuma ordem encontrada para essa busca."}
          </p>
        </div>
      ) : null}
      {filtered.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 font-medium">Número</th>
                  <th className="px-3 py-3 font-medium">Data</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Placa</th>
                  <th className="px-3 py-3 font-medium">Veículo</th>
                  <th className="px-3 py-3 font-medium">Pagamento</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    tabIndex={0}
                    className="cursor-pointer border-t border-line hover:bg-orange-50/50"
                    aria-label={`Abrir ordem ${formatOrderNumber(order.number)}`}
                    onClick={() => openOrder(order.id, order.number)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openOrder(order.id, order.number);
                    }}
                  >
                    <td className="px-3 py-3 font-medium tabular-nums">{formatOrderNumber(order.number)}</td>
                    <td className="px-3 py-3">{formatDate(order.createdAt)}</td>
                    <td className="px-3 py-3">{order.clientName}</td>
                    <td className="px-3 py-3 tabular-nums">{order.plate}</td>
                    <td className="px-3 py-3">{order.vehicle}</td>
                    <td className="px-3 py-3">{order.paymentMethod}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{formatMoney(order.total)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-stone-500 hover:bg-red-50 hover:text-red-800"
                        aria-label={`Excluir OS ${formatOrderNumber(order.number)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(order);
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Screen>
  );
};
