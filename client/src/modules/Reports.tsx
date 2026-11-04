import type { ReportBasis, ReportMode, ReportResult } from "@shared/types";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { Alert, Button, Screen, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { errorMessage, fold, formatDate, formatMoney, isOverdue, monthLabel, todayISO, currentMonth } from "@/lib/format";

type Kind = "payables" | "receivables";

export const Reports = () => {
  const [kind, setKind] = useState<Kind>("payables");
  const [mode, setMode] = useState<ReportMode>("month");
  const [month, setMonth] = useState(currentMonth());
  const [day, setDay] = useState(todayISO());
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [basis, setBasis] = useState<ReportBasis>("due");
  const [status, setStatus] = useState("todas");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const consult = async (nextKind = kind, nextStatus = status) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ mode, basis, status: nextStatus });
      if (mode === "month") params.set("month", month);
      if (mode === "day") params.set("day", day);
      if (mode === "range") {
        params.set("from", from);
        params.set("to", to);
      }
      setResult(await api.report(nextKind, params));
    } catch (caught) {
      setResult(null);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void consult();
    // A consulta inicial usa o mês corrente. Os filtros seguintes esperam o botão Consultar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchKind = (next: Kind) => {
    const nextStatus = next === "payables" && status === "recebido" ? "todas" : next === "receivables" && status === "pago" ? "todas" : status;
    setKind(next);
    setStatus(nextStatus);
    void consult(next, nextStatus);
  };

  const rows = (result?.rows ?? []).filter((row) => fold(`${row.description} ${row.partyName}`).includes(fold(search)));
  const title = kind === "payables" ? "Contas a pagar" : "Contas a receber";
  const settledLabel = kind === "payables" ? "Pagas" : "Recebidas";
  const basisLabel = basis === "due" ? "vencimento" : kind === "payables" ? "pagamento" : "recebimento";
  const periodLabel = mode === "month" ? monthLabel(month) : result ? (result.from === result.to ? formatDate(result.from) : `${formatDate(result.from)} a ${formatDate(result.to)}`) : "";

  return (
    <Screen
      title="Relatórios"
      description="Consulte contas a pagar e a receber por mês, por dia ou entre duas datas."
      actions={
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" />
          Imprimir
        </Button>
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <section className="no-print card flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {([
              ["payables", "Contas a pagar"],
              ["receivables", "Contas a receber"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn("rounded-lg px-3 py-2 text-sm font-medium", kind === value ? "bg-ink text-white" : "bg-stone-100")}
                onClick={() => switchKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block" htmlFor="report-mode">
              <span className="field-label">Período</span>
              <select id="report-mode" className="field-input" value={mode} onChange={(event) => setMode(event.target.value as ReportMode)}>
                <option value="month">Um mês</option>
                <option value="day">Um dia</option>
                <option value="range">Entre duas datas</option>
              </select>
            </label>
            {mode === "month" ? (
              <label className="block" htmlFor="report-month">
                <span className="field-label">Mês</span>
                <input id="report-month" type="month" className="field-input" value={month} onChange={(event) => setMonth(event.target.value)} />
              </label>
            ) : null}
            {mode === "day" ? (
              <label className="block" htmlFor="report-day">
                <span className="field-label">Dia</span>
                <input id="report-day" type="date" className="field-input" value={day} onChange={(event) => setDay(event.target.value)} />
              </label>
            ) : null}
            {mode === "range" ? (
              <>
                <label className="block" htmlFor="report-from">
                  <span className="field-label">De</span>
                  <input id="report-from" type="date" className="field-input" value={from} onChange={(event) => setFrom(event.target.value)} />
                </label>
                <label className="block" htmlFor="report-to">
                  <span className="field-label">Até</span>
                  <input id="report-to" type="date" className="field-input" value={to} onChange={(event) => setTo(event.target.value)} />
                </label>
              </>
            ) : null}
            <label className="block" htmlFor="report-basis">
              <span className="field-label">Considerar</span>
              <select id="report-basis" className="field-input" value={basis} onChange={(event) => setBasis(event.target.value as ReportBasis)}>
                <option value="due">Data de vencimento</option>
                <option value="settlement">{kind === "payables" ? "Data de pagamento" : "Data de recebimento"}</option>
              </select>
            </label>
            <label className="block" htmlFor="report-status">
              <span className="field-label">Situação</span>
              <select id="report-status" className="field-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="todas">Todas</option>
                <option value="pendente">Pendentes</option>
                <option value={kind === "payables" ? "pago" : "recebido"}>{settledLabel}</option>
              </select>
            </label>
          </div>
          <div>
            <Button onClick={() => void consult()} disabled={loading}>
              {loading ? "Consultando..." : "Consultar"}
            </Button>
          </div>
        </section>
        {error ? <Alert>{error}</Alert> : null}
        {result ? (
          <>
            <div>
              <h2 className="font-display text-xl font-semibold">
                {title} · {periodLabel}
              </h2>
              <p className="text-sm text-muted">Filtrado por data de {basisLabel}.</p>
            </div>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Lançamentos", String(result.count)],
                ["Total", formatMoney(result.total)],
                ["Pendente", formatMoney(result.pendingTotal)],
                [settledLabel, formatMoney(result.settledTotal)],
              ].map(([label, value]) => (
                <article key={label} className="card px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                  <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
                </article>
              ))}
            </section>
            <div className="no-print max-w-sm">
              <input className="field-input" placeholder="Buscar nesta lista" aria-label="Buscar nesta lista" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3 font-medium">Descrição</th>
                      <th className="px-3 py-3 font-medium">{kind === "payables" ? "Fornecedor" : "Cliente"}</th>
                      <th className="px-3 py-3 font-medium">Vencimento</th>
                      <th className="px-3 py-3 font-medium">{kind === "payables" ? "Pagamento" : "Recebimento"}</th>
                      <th className="px-3 py-3 text-right font-medium">Valor</th>
                      <th className="px-3 py-3 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-muted" colSpan={6}>
                          Nenhuma conta encontrada nesse período.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id} className="border-t border-line">
                          <td className="px-3 py-3">{row.description}</td>
                          <td className="px-3 py-3">{row.partyName}</td>
                          <td className={cn("px-3 py-3", isOverdue(row.dueDate, row.status) && "text-red-800")}>{formatDate(row.dueDate)}</td>
                          <td className="px-3 py-3">{formatDate(row.settlementDate)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatMoney(row.amount)}</td>
                          <td className="px-3 py-3">
                            <StatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Screen>
  );
};
