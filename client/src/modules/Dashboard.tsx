import { useCallback, useEffect, useState } from "react";
import { api } from "@/api";
import { useOnData } from "@/lib/events";
import { errorMessage, formatDate, formatMoney, formatOrderNumber } from "@/lib/format";
import { useWorkspace } from "@/workspace/WorkspaceContext";
import type { DashboardSummary } from "@shared/types";

export const Dashboard = () => {
  const { openNewOrder, openOrder, openSingleton } = useWorkspace();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSummary(await api.dashboard());
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useOnData("clients", load);
  useOnData("vehicles", load);
  useOnData("suppliers", load);
  useOnData("orders", load);
  useOnData("payables", load);
  useOnData("receivables", load);

  const cards = summary
    ? [
        { label: "Ordens de serviço", value: String(summary.serviceOrders), detail: "emitidas no sistema", action: () => openSingleton("service-orders", "Ordens de serviço") },
        { label: "Clientes", value: String(summary.clients), detail: `${summary.vehicles} veículos · ${summary.suppliers} fornecedores`, action: () => openSingleton("clients", "Clientes") },
        { label: "A receber", value: formatMoney(summary.pendingReceivablesAmount), detail: summary.dueTodayReceivablesAmount > 0 ? `${formatMoney(summary.dueTodayReceivablesAmount)} vence hoje` : `${summary.pendingReceivables} pendências`, action: () => openSingleton("receivables", "Contas a receber") },
        { label: "A pagar", value: formatMoney(summary.pendingPayablesAmount), detail: summary.dueTodayPayablesAmount > 0 ? `${formatMoney(summary.dueTodayPayablesAmount)} vence hoje` : `${summary.pendingPayables} pendências`, action: () => openSingleton("payables", "Contas a pagar") },
      ]
    : [];

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Painel</h1>
            <p className="mt-1 text-sm text-muted">Abra quantas abas precisar. O que estiver preenchido continua aqui quando você troca de tela.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openNewOrder}>
            Nova ordem de serviço
          </button>
        </header>
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        {!summary && !error ? <p className="text-sm text-muted">Carregando...</p> : null}
        {summary ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => (
                <button key={card.label} type="button" className="card px-4 py-4 text-left hover:border-copper" onClick={card.action}>
                  <p className="text-sm text-muted">{card.label}</p>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{card.value}</p>
                  <p className="mt-1 text-xs text-muted">{card.detail}</p>
                </button>
              ))}
            </section>
            <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <h2 className="font-medium">Últimas ordens</h2>
                  <button type="button" className="text-sm text-copper hover:underline" onClick={() => openSingleton("service-orders", "Ordens de serviço")}>
                    Ver todas
                  </button>
                </div>
                {summary.recentOrders.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-muted">Nenhuma ordem ainda. Cadastre o cliente e o veículo, depois emita a primeira OS.</p>
                ) : (
                  <ul>
                    {summary.recentOrders.map((order) => (
                      <li key={order.id} className="border-t border-line first:border-t-0">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-orange-50/60"
                          onClick={() => openOrder(order.id, order.number)}
                        >
                          <span>
                            <span className="block font-medium tabular-nums">OS {formatOrderNumber(order.number)}</span>
                            <span className="block text-sm text-muted">
                              {order.clientName} · {order.plate}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block font-medium tabular-nums">{formatMoney(order.total)}</span>
                            <span className="block text-xs text-muted">{formatDate(order.createdAt)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card p-4">
                <h2 className="font-medium">Atalhos</h2>
                <div className="mt-3 grid gap-2">
                  <button type="button" className="btn btn-secondary justify-start" onClick={() => openSingleton("clients", "Clientes")}>
                    Cadastrar cliente
                  </button>
                  <button type="button" className="btn btn-secondary justify-start" onClick={() => openSingleton("vehicles", "Veículos")}>
                    Cadastrar veículo
                  </button>
                  <button type="button" className="btn btn-secondary justify-start" onClick={() => openSingleton("payables", "Contas a pagar")}>
                    Lançar conta a pagar
                  </button>
                  <button type="button" className="btn btn-secondary justify-start" onClick={() => openSingleton("reports", "Relatórios")}>
                    Abrir relatórios
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
};
