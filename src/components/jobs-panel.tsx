"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Job {
  id: string;
  kind: string;
  status: string;
  progress: number;
  total: number;
  message: string | null;
  log: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  startedAt: string;
  finishedAt: string | null;
}
interface KindInfo {
  id: string;
  label: string;
  desc: string;
  claude: boolean;
}

export function JobsPanel({ kinds, claudeReady, engine }: { kinds: KindInfo[]; claudeReady: boolean; engine: "api" | "claude-code" }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [budget, setBudget] = useState(25);
  const [limit, setLimit] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refresh = async () => {
    const r = await fetch("/api/jobs");
    if (r.ok) setJobs((await r.json()) as Job[]);
  };
  useEffect(() => {
    const tick = () => {
      refresh();
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 2500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const anyRunning = jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!anyRunning) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyRunning]);

  const launch = async (kind: string) => {
    setError(null);
    const params: Record<string, unknown> = {};
    if (limit) params.limit = Number(limit);
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, params, budgetUsd: budget }) });
    const j = (await r.json()) as { id?: string; error?: string };
    if (j.error) setError(j.error);
    refresh();
  };
  const cancel = async (id: string) => {
    await fetch(`/api/jobs?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <label className="flex items-center gap-1">
          Budget max par job
          <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-20 border border-border rounded px-2 py-1 bg-surface" min={1} /> $
        </label>
        <label className="flex items-center gap-1">
          Limite (test)
          <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="ex. 100" className="w-24 border border-border rounded px-2 py-1 bg-surface" />
        </label>
        {!claudeReady && <span className="text-warn text-xs">{engine === "claude-code" ? "Claude Code introuvable : installez-le et connectez-vous (`claude auth login`)." : "Clé API absente : renseignez ANTHROPIC_API_KEY dans .env."}</span>}
        {engine === "claude-code" && claudeReady && <span className="text-xs text-ink-3">Les coûts affichés sont des équivalents : rien n'est facturé, l'usage est compté sur votre abonnement Claude.</span>}
        {error && <span className="text-bad text-xs">{error}</span>}
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        {kinds.map((k) => {
          const running = jobs.find((j) => j.kind === k.id && j.status === "running");
          return (
            <div key={k.id} className="card p-3 flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">
                  {k.label}
                  {k.claude && <span className="text-[10px] rounded bg-accent/15 text-accent-ink px-1">Claude</span>}
                </div>
                <div className="text-xs text-ink-3 mt-0.5">{k.desc}</div>
                {running && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full bg-accent transition-all" style={{ width: running.total ? `${(running.progress / running.total) * 100}%` : "30%" }} />
                    </div>
                    <div className="text-xs text-ink-2 mt-1">{running.message}</div>
                  </div>
                )}
              </div>
              {running ? (
                <button onClick={() => cancel(running.id)} className="text-xs rounded border border-border px-2 py-1 hover:border-bad hover:text-bad">
                  Arrêter
                </button>
              ) : (
                <button onClick={() => launch(k.id)} className="text-xs rounded bg-ink text-bg px-2.5 py-1">
                  Lancer
                </button>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="font-semibold text-sm mt-4">Historique</h3>
      <ul className="space-y-1 text-xs">
        {jobs.map((j) => (
          <li key={j.id} className="card px-3 py-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`rounded px-1.5 py-0.5 ${j.status === "done" ? "bg-good/10 text-good" : j.status === "running" ? "bg-accent/15 text-accent-ink" : j.status === "cancelled" ? "bg-surface-2 text-ink-3" : "bg-bad/10 text-bad"}`}>{j.status}</span>
              <span className="font-medium">{kinds.find((k) => k.id === j.kind)?.label ?? j.kind}</span>
              <span className="text-ink-3">{new Date(j.startedAt).toLocaleString("fr-FR")}</span>
              <span className="text-ink-3 truncate max-w-md">{j.message}</span>
              <span className="ml-auto tabular-nums text-ink-2">
                {j.costUsd.toFixed(2)} $ · {(j.inputTokens / 1000).toFixed(0)}k in / {(j.outputTokens / 1000).toFixed(0)}k out{j.cacheReadTokens ? ` / ${(j.cacheReadTokens / 1000).toFixed(0)}k cache` : ""}
              </span>
              <button onClick={() => setOpen(open === j.id ? null : j.id)} className="underline text-ink-3">
                log
              </button>
            </div>
            {open === j.id && <pre className="mt-2 max-h-64 overflow-auto bg-surface-2 rounded p-2 whitespace-pre-wrap font-mono text-[11px]">{j.log || "(vide)"}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}
