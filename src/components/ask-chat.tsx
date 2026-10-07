"use client";
import { useState, useRef, useEffect } from "react";
import { marked } from "marked";

interface Msg {
  role: "user" | "assistant";
  content: string;
  tools?: { name: string; input: unknown }[];
  cost?: number;
}

const SUGGESTIONS = [
  "Quels partis ont voté pour l'abrogation de la réforme des retraites, et lesquels s'y étaient engagés dans leur programme ?",
  "Sur l'immigration, le RN vote-t-il comme il parle ?",
  "Quelles sont les plus grosses contradictions entre programme et votes, tous partis confondus ?",
  "Comment Renaissance et LR ont-ils voté sur la fiscalité des hauts revenus ?",
  "Quels députés votent le plus souvent contre leur propre groupe ?",
];

export function AskChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history: messages.map((m) => ({ role: m.role, content: m.content })) }) });
      const j = (await res.json()) as { answer?: string; toolCalls?: Msg["tools"]; costUsd?: number; error?: string };
      setMessages([...next, { role: "assistant", content: j.answer ?? `Erreur : ${j.error ?? res.status}`, tools: j.toolCalls, cost: j.costUsd }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `Erreur réseau : ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {messages.length === 0 && (
        <div className="grid md:grid-cols-2 gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="card p-3 text-left text-sm hover:border-accent">
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`card p-4 ${m.role === "user" ? "bg-surface-2" : ""}`}>
            <div className="text-[11px] uppercase tracking-wide text-ink-3 mb-1">{m.role === "user" ? "Vous" : "Apollon"}</div>
            {m.role === "assistant" ? <div className="prose-apollon text-sm" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }} /> : <p className="text-sm whitespace-pre-wrap">{m.content}</p>}
            {m.tools && m.tools.length > 0 && (
              <details className="mt-2 text-xs text-ink-3">
                <summary className="cursor-pointer">
                  {m.tools.length} recherche{m.tools.length > 1 ? "s" : ""} dans la base{m.cost !== undefined ? ` · ${m.cost.toFixed(3)} $` : ""}
                </summary>
                <ul className="mt-1 font-mono">
                  {m.tools.map((t, k) => (
                    <li key={k}>
                      {t.name}({JSON.stringify(t.input)})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {busy && <div className="card p-4 text-sm text-ink-3 animate-pulse">Apollon consulte les scrutins…</div>}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 sticky bottom-4"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Posez une question sur un parti, un vote, un thème…" className="flex-1 border border-border rounded-md px-3 py-2 bg-surface text-sm shadow" disabled={busy} />
        <button className="rounded-md bg-ink text-bg px-4 py-2 text-sm" disabled={busy}>
          Demander
        </button>
      </form>
    </div>
  );
}
