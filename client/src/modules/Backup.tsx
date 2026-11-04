import type { BackupFileInfo } from "@shared/types";
import { Download, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { useFeedback } from "@/components/Feedback";
import { Alert, Button, Screen, TextField } from "@/components/ui";
import { useDirtyBaseline } from "@/hooks/useDirty";
import { emitData } from "@/lib/events";
import { errorMessage, formatBytes, formatDateTime } from "@/lib/format";

type Pending =
  | { type: "file"; fileName: string }
  | { type: "json"; payload: unknown; label: string };

export const BackupScreen = ({ tabId }: { tabId: string }) => {
  const { notify } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [companyName, setCompanyName] = useState("");
  const [directory, setDirectory] = useState("");
  const [files, setFiles] = useState<BackupFileInfo[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [phrase, setPhrase] = useState("");
  const { markClean } = useDirtyBaseline(tabId, ready, companyName);

  const load = async () => {
    const [settings, backups] = await Promise.all([api.settings.get(), api.backups.list()]);
    setCompanyName(settings.companyName);
    setDirectory(backups.directory);
    setFiles(backups.files);
    setReady(true);
    return settings.companyName;
  };

  useEffect(() => {
    void load().catch((caught: unknown) => setError(errorMessage(caught)));
  }, []);

  const handleSaveName = async () => {
    setSavingName(true);
    setError("");
    try {
      const saved = await api.settings.update(companyName);
      setCompanyName(saved.companyName);
      markClean(saved.companyName);
      emitData("settings");
      notify("Nome da empresa salvo.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSavingName(false);
    }
  };

  const handleCreate = async () => {
    setWorking(true);
    setError("");
    try {
      await api.backups.create();
      const backups = await api.backups.list();
      setFiles(backups.files);
      notify("Cópia de segurança criada.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  };

  const handleRestore = async () => {
    if (!pending || phrase.trim().toUpperCase() !== "RESTAURAR") return;
    setWorking(true);
    setError("");
    try {
      if (pending.type === "file") await api.backups.restore(pending.fileName);
      else await api.backups.importJson(pending.payload);
      notify("Cópia restaurada. A página vai recarregar.");
      window.location.reload();
    } catch (caught) {
      setError(errorMessage(caught));
      setWorking(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      setPhrase("");
      setPending({ type: "json", payload, label: file.name });
    } catch {
      setError("Não foi possível ler esse arquivo JSON.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Screen
      title="Backup"
      description="As cópias são gravadas ao abrir o sistema e repetidas a cada 12 horas enquanto ele estiver aberto. Também dá para gerar uma cópia na hora."
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {error ? <Alert>{error}</Alert> : null}
        <section className="card flex flex-col gap-4 p-4">
          <div>
            <h2 className="font-medium">Nome da empresa na ordem de serviço</h2>
            <p className="mt-1 text-sm text-muted">Aparece no cabeçalho da OS, inclusive na impressão.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <TextField id={`${tabId}-company`} label="Nome da empresa" maxLength={80} value={companyName} onChange={setCompanyName} />
            <Button onClick={() => void handleSaveName()} disabled={savingName}>
              {savingName ? "Salvando..." : "Salvar nome"}
            </Button>
          </div>
        </section>
        <section className="card flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleCreate()} disabled={working}>
              Fazer backup agora
            </Button>
            <Button variant="secondary" onClick={() => void api.backups.exportJson().catch((caught: unknown) => setError(errorMessage(caught)))}>
              <Download size={16} aria-hidden="true" />
              Baixar JSON
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Restaurar de um JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Arquivo JSON de backup"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </div>
          <p className="break-all text-xs text-muted">Pasta das cópias: {directory || "Carregando..."}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Quando</th>
                  <th className="px-2 py-2 font-medium">Arquivo</th>
                  <th className="px-2 py-2 font-medium">Tamanho</th>
                  <th className="px-2 py-2 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td className="px-2 py-6 text-muted" colSpan={4}>
                      Nenhuma cópia ainda. A primeira é criada quando o servidor inicia.
                    </td>
                  </tr>
                ) : (
                  files.map((file) => (
                    <tr key={file.fileName} className="border-t border-line">
                      <td className="px-2 py-3">{formatDateTime(file.createdAt)}</td>
                      <td className="px-2 py-3">{file.fileName}</td>
                      <td className="px-2 py-3 tabular-nums">{formatBytes(file.size)}</td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => void api.backups.download(file.fileName).catch((caught: unknown) => setError(errorMessage(caught)))}>
                            Baixar
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setPhrase("");
                              setPending({ type: "file", fileName: file.fileName });
                            }}
                          >
                            <RotateCcw size={16} aria-hidden="true" />
                            Restaurar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {pending ? (
        <div className="no-print fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="restore-title" className="card w-full max-w-md p-5">
            <h2 id="restore-title" className="font-display text-lg font-semibold">
              Restaurar dados
            </h2>
            <p className="mt-2 text-sm text-muted">
              Isso substitui clientes, veículos, ordens e o financeiro pelos dados de{" "}
              {pending.type === "file" ? pending.fileName : pending.label}. Digite RESTAURAR para confirmar.
            </p>
            <label className="mt-4 block" htmlFor="restore-phrase">
              <span className="sr-only">Confirmação</span>
              <input id="restore-phrase" className="field-input" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button variant="danger" disabled={phrase.trim().toUpperCase() !== "RESTAURAR" || working} onClick={() => void handleRestore()}>
                Restaurar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Screen>
  );
};
