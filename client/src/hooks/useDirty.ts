import { useEffect, useRef } from "react";
import { useWorkspace } from "@/workspace/WorkspaceContext";

export const useDirtyBaseline = (tabId: string, ready: boolean, snapshot: string) => {
  const { setDirty } = useWorkspace();
  const baseline = useRef<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (baseline.current == null) {
      baseline.current = snapshot;
      dirty.current = false;
      setDirty(tabId, false);
      return;
    }
    const nextDirty = baseline.current !== snapshot;
    dirty.current = nextDirty;
    setDirty(tabId, nextDirty);
  }, [ready, setDirty, snapshot, tabId]);

  const markClean = (nextSnapshot = snapshot) => {
    baseline.current = nextSnapshot;
    dirty.current = false;
    setDirty(tabId, false);
  };

  return { markClean, isDirty: () => dirty.current };
};
