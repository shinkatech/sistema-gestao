import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; tone: "ok" | "error" };

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
};

type DialogState = ConfirmOptions & { resolve: (value: boolean) => void };

type FeedbackContextValue = {
  notify: (message: string, tone?: "ok" | "error") => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("Feedback indisponível.");
  return context;
};

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      notify: (message, tone = "ok") => {
        const id = Date.now() + Math.random();
        setToasts((current) => [...current, { id, message, tone }]);
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 3600);
      },
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setDialog({ ...options, resolve });
        }),
    }),
    [],
  );

  const closeDialog = (accepted: boolean) => {
    dialog?.resolve(accepted);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg ${toast.tone === "error" ? "bg-red-800 text-white" : "bg-sidebar text-white"}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
      {dialog ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="card w-full max-w-md p-5">
            <h2 id="confirm-title" className="font-display text-lg font-semibold">
              {dialog.title}
            </h2>
            <p className="mt-2 text-sm text-muted">{dialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => closeDialog(false)}>
                Cancelar
              </button>
              <button type="button" className={dialog.danger ? "btn btn-danger" : "btn btn-primary"} onClick={() => closeDialog(true)}>
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
};
