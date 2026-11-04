import {
  CarFront,
  ClipboardList,
  DatabaseBackup,
  LayoutDashboard,
  Plus,
  Receipt,
  Truck,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BackupScreen } from "@/modules/Backup";
import { ClientsScreen } from "@/modules/Clients";
import { Dashboard } from "@/modules/Dashboard";
import { Ledger } from "@/modules/Ledger";
import { Reports } from "@/modules/Reports";
import { ServiceOrderForm } from "@/modules/ServiceOrderForm";
import { ServiceOrders } from "@/modules/ServiceOrders";
import { SuppliersScreen } from "@/modules/Suppliers";
import { VehiclesScreen } from "@/modules/Vehicles";
import { cn } from "@/lib/cn";
import { useWorkspace, type SingletonKind, type WorkspaceTab } from "@/workspace/WorkspaceContext";

const groups: Array<{
  label: string;
  items: Array<{ kind: SingletonKind; title: string; icon: LucideIcon }>;
}> = [
  {
    label: "Operação",
    items: [
      { kind: "dashboard", title: "Painel", icon: LayoutDashboard },
      { kind: "service-orders", title: "Ordens de serviço", icon: ClipboardList },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { kind: "clients", title: "Clientes", icon: Users },
      { kind: "vehicles", title: "Veículos", icon: CarFront },
      { kind: "suppliers", title: "Fornecedores", icon: Truck },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { kind: "payables", title: "Contas a pagar", icon: WalletCards },
      { kind: "receivables", title: "Contas a receber", icon: Receipt },
      { kind: "reports", title: "Relatórios", icon: ClipboardList },
    ],
  },
  {
    label: "Sistema",
    items: [{ kind: "backup", title: "Backup", icon: DatabaseBackup }],
  },
];

const TabContent = ({ tab }: { tab: WorkspaceTab }) => {
  if (tab.kind === "dashboard") return <Dashboard />;
  if (tab.kind === "service-orders") return <ServiceOrders />;
  if (tab.kind === "service-order-form") return <ServiceOrderForm tabId={tab.id} orderId={tab.orderId} />;
  if (tab.kind === "clients") return <ClientsScreen tabId={tab.id} />;
  if (tab.kind === "vehicles") return <VehiclesScreen tabId={tab.id} />;
  if (tab.kind === "suppliers") return <SuppliersScreen tabId={tab.id} />;
  if (tab.kind === "payables") return <Ledger tabId={tab.id} kind="payables" />;
  if (tab.kind === "receivables") return <Ledger tabId={tab.id} kind="receivables" />;
  if (tab.kind === "reports") return <Reports />;
  if (tab.kind === "backup") return <BackupScreen tabId={tab.id} />;
  return null;
};

export const Shell = () => {
  const { tabs, activeId, dirtyIds, openSingleton, openNewOrder, focusTab, closeTab } = useWorkspace();
  const [online, setOnline] = useState(true);
  const active = tabs.find((tab) => tab.id === activeId);

  useEffect(() => {
    document.title = active ? `${active.title} · ServiOS` : "ServiOS";
  }, [active]);

  useEffect(() => {
    const check = () => {
      fetch("/api/health")
        .then((response) => setOnline(response.ok))
        .catch(() => setOnline(false));
    };
    check();
    const timer = window.setInterval(check, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const activeKind = active?.kind;

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-paper text-ink">
      <aside className="no-print flex w-64 shrink-0 flex-col bg-sidebar text-slate-300">
        <button type="button" className="flex items-center gap-3 px-4 py-5 text-left" onClick={() => openSingleton("dashboard", "Painel")}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-copper font-display text-sm font-semibold text-white">OS</span>
          <span>
            <span className="block font-display text-base font-semibold text-white">ServiOS</span>
            <span className="block text-xs text-slate-400">Gestão da oficina</span>
          </span>
        </button>
        <nav className="flex-1 space-y-5 overflow-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const selected =
                    item.kind === activeKind || (item.kind === "service-orders" && activeKind === "service-order-form");
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/5 hover:text-white",
                        selected && "bg-white/10 font-medium text-white shadow-[inset_3px_0_0_#a3471a]",
                      )}
                      onClick={() => openSingleton(item.kind, item.title)}
                    >
                      <Icon size={18} aria-hidden="true" />
                      {item.title}
                    </button>
                  );
                })}
              </div>
              {group.label === "Operação" ? (
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-copper px-3 py-2.5 text-sm font-medium text-white hover:bg-copper-dark"
                  onClick={openNewOrder}
                >
                  <Plus size={16} aria-hidden="true" />
                  Nova ordem
                </button>
              ) : null}
            </div>
          ))}
        </nav>
      </aside>
      <div className="app-main flex min-w-0 flex-1 flex-col">
        {online ? null : (
          <div className="no-print bg-red-800 px-4 py-2 text-sm text-white">A API não está respondendo. Deixe o servidor aberto e atualize a página.</div>
        )}
        <div className="no-print flex items-end gap-1 overflow-x-auto border-b border-line bg-[#e7e1d6] px-3 pt-2" role="tablist" aria-label="Abas abertas">
          {tabs.map((tab) => {
            const selected = tab.id === activeId;
            return (
              <div key={tab.id} className={cn("flex max-w-56 shrink-0 items-center rounded-t-lg", selected ? "bg-paper" : "bg-transparent")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={tab.title}
                  className={cn("flex min-w-0 items-center gap-2 px-3 py-2 text-sm", selected ? "font-medium text-ink" : "text-stone-600 hover:text-ink")}
                  onClick={() => focusTab(tab.id)}
                >
                  {dirtyIds.has(tab.id) ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-copper" aria-label="Alterações não salvas" /> : null}
                  <span className="truncate">{tab.title}</span>
                </button>
                <button
                  type="button"
                  className="mr-1 rounded p-1 text-stone-500 hover:bg-black/5 hover:text-ink"
                  aria-label={`Fechar ${tab.title}`}
                  onClick={() => void closeTab(tab.id)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="min-h-0 flex-1">
          {tabs.map((tab) => (
            <div key={tab.id} className={tab.id === activeId ? "print-area h-full min-h-0" : "hidden"} role="tabpanel" aria-label={tab.title}>
              <TabContent tab={tab} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
