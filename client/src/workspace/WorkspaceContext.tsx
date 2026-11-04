import { formatOrderNumber } from "@shared/format";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFeedback } from "@/components/Feedback";

export type TabKind =
  | "dashboard"
  | "service-orders"
  | "service-order-form"
  | "clients"
  | "vehicles"
  | "suppliers"
  | "payables"
  | "receivables"
  | "reports"
  | "backup";

export type SingletonKind = Exclude<TabKind, "service-order-form">;

export type WorkspaceTab = {
  id: string;
  dedupeKey: string;
  kind: TabKind;
  title: string;
  orderId: number | null;
};

type WorkspaceContextValue = {
  tabs: WorkspaceTab[];
  activeId: string;
  dirtyIds: Set<string>;
  openSingleton: (kind: SingletonKind, title: string) => void;
  openNewOrder: () => void;
  openOrder: (orderId: number, number: number) => void;
  focusTab: (tabId: string) => void;
  closeTab: (tabId: string) => Promise<void>;
  updateTab: (tabId: string, patch: Partial<Pick<WorkspaceTab, "title" | "orderId" | "dedupeKey">>) => void;
  setDirty: (tabId: string, dirty: boolean) => void;
};

const STORAGE_KEY = "servios-tabs-v1";
const KINDS = new Set<TabKind>([
  "dashboard",
  "service-orders",
  "service-order-form",
  "clients",
  "vehicles",
  "suppliers",
  "payables",
  "receivables",
  "reports",
  "backup",
]);

const dashboardTab = (): WorkspaceTab => ({
  id: "dashboard",
  dedupeKey: "dashboard",
  kind: "dashboard",
  title: "Painel",
  orderId: null,
});

const readStored = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tabs?: WorkspaceTab[]; activeId?: string };
    if (!Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter(
      (tab) =>
        tab &&
        typeof tab.id === "string" &&
        typeof tab.dedupeKey === "string" &&
        typeof tab.title === "string" &&
        KINDS.has(tab.kind) &&
        (tab.orderId == null || typeof tab.orderId === "number"),
    );
    if (tabs.length === 0) return null;
    const activeId = tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId! : tabs[0].id;
    return { tabs, activeId };
  } catch {
    return null;
  }
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Área de trabalho indisponível.");
  return context;
};

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { confirm } = useFeedback();
  const stored = useRef(readStored());
  const [tabs, setTabs] = useState<WorkspaceTab[]>(stored.current?.tabs ?? [dashboardTab()]);
  const [activeId, setActiveId] = useState(stored.current?.activeId ?? "dashboard");
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const tabsRef = useRef(tabs);
  const dirtyRef = useRef(new Map<string, boolean>());
  tabsRef.current = tabs;

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeId }));
  }, [tabs, activeId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if ([...dirtyRef.current.values()].some(Boolean)) event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const focusTab = useCallback((tabId: string) => setActiveId(tabId), []);

  const setDirty = useCallback((tabId: string, dirty: boolean) => {
    dirtyRef.current.set(tabId, dirty);
    setDirtyIds((current) => {
      if (current.has(tabId) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(tabId);
      else next.delete(tabId);
      return next;
    });
  }, []);

  const openTab = useCallback((input: Omit<WorkspaceTab, "id">) => {
    const existing = tabsRef.current.find((tab) => tab.dedupeKey === input.dedupeKey);
    if (existing) {
      setActiveId(existing.id);
      return existing.id;
    }
    const id = crypto.randomUUID();
    const next = [...tabsRef.current, { ...input, id }];
    tabsRef.current = next;
    setTabs(next);
    setActiveId(id);
    return id;
  }, []);

  const openSingleton = useCallback(
    (kind: SingletonKind, title: string) => {
      openTab({ dedupeKey: kind, kind, title, orderId: null });
    },
    [openTab],
  );

  const openNewOrder = useCallback(() => {
    const key = crypto.randomUUID();
    openTab({ dedupeKey: `order-new-${key}`, kind: "service-order-form", title: "Nova OS", orderId: null });
  }, [openTab]);

  const openOrder = useCallback(
    (orderId: number, number: number) => {
      openTab({
        dedupeKey: `order-${orderId}`,
        kind: "service-order-form",
        title: `OS ${formatOrderNumber(number)}`,
        orderId,
      });
    },
    [openTab],
  );

  const updateTab = useCallback((tabId: string, patch: Partial<Pick<WorkspaceTab, "title" | "orderId" | "dedupeKey">>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const closeTab = useCallback(
    async (tabId: string) => {
      if (dirtyRef.current.get(tabId)) {
        const accepted = await confirm({
          title: "Alterações não salvas",
          message: "Esta aba tem informações que ainda não foram salvas. Deseja fechá-la mesmo assim?",
          confirmLabel: "Fechar sem salvar",
          danger: true,
        });
        if (!accepted) return;
      }
      dirtyRef.current.delete(tabId);
      setDirtyIds((current) => {
        if (!current.has(tabId)) return current;
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
      sessionStorage.removeItem(`servios-os-draft-${tabId}`);
      const current = tabsRef.current;
      const index = current.findIndex((tab) => tab.id === tabId);
      const remaining = current.filter((tab) => tab.id !== tabId);
      const next = remaining.length > 0 ? remaining : [dashboardTab()];
      tabsRef.current = next;
      setTabs(next);
      setActiveId((active) => {
        if (active !== tabId) return active;
        return next[Math.max(0, Math.min(index - 1, next.length - 1))]?.id ?? next[0].id;
      });
    },
    [confirm],
  );

  const value = useMemo(
    () => ({
      tabs,
      activeId,
      dirtyIds,
      openSingleton,
      openNewOrder,
      openOrder,
      focusTab,
      closeTab,
      updateTab,
      setDirty,
    }),
    [tabs, activeId, dirtyIds, openSingleton, openNewOrder, openOrder, focusTab, closeTab, updateTab, setDirty],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
