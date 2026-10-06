"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddDocumentForm({ parties }: { parties: { id: string; name: string }[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form
      className="space-y-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const body = Object.fromEntries(fd.entries());
        const r = await fetch("/api/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = (await r.json()) as { id?: number; error?: string };
        setMsg(j.error ?? `Document #${j.id} ajouté. Lancez « Analyser les programmes ».`);
        if (!j.error) (e.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      <div className="grid md:grid-cols-3 gap-2">
        <select name="partyId" required className="border border-border rounded px-2 py-1.5 bg-surface">
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input name="title" required placeholder="Titre (ex. Programme présidentiel 2027)" className="border border-border rounded px-2 py-1.5 bg-surface" />
        <input name="url" placeholder="URL (PDF ou page web)" className="border border-border rounded px-2 py-1.5 bg-surface" />
      </div>
      <textarea name="text" rows={3} placeholder="…ou collez directement le texte du programme ici (optionnel)" className="w-full border border-border rounded px-2 py-1.5 bg-surface" />
      <div className="flex items-center gap-3">
        <button className="rounded bg-ink text-bg px-3 py-1.5">Ajouter la source</button>
        {msg && <span className="text-xs text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}

export function ImportPostsForm({ parties }: { parties: { id: string; name: string }[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form
      className="space-y-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const r = await fetch("/api/posts/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partyId: fd.get("partyId"), handle: fd.get("handle"), raw: fd.get("raw") }) });
        const j = (await r.json()) as { count?: number; error?: string };
        setMsg(j.error ?? `${j.count} messages importés. Lancez « Analyser les tweets ».`);
        router.refresh();
      }}
    >
      <div className="grid md:grid-cols-2 gap-2">
        <select name="partyId" className="border border-border rounded px-2 py-1.5 bg-surface">
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input name="handle" required placeholder="Compte (ex. J_Bardella)" className="border border-border rounded px-2 py-1.5 bg-surface" />
      </div>
      <textarea
        name="raw"
        rows={4}
        required
        placeholder={`Un message par ligne : date<TAB>texte   (ex. 2026-09-12\tNous avons voté contre…)\nou un tableau JSON [{"id","text","created_at","url"}] (export X)`}
        className="w-full border border-border rounded px-2 py-1.5 bg-surface font-mono text-xs"
      />
      <div className="flex items-center gap-3">
        <button className="rounded bg-ink text-bg px-3 py-1.5">Importer</button>
        {msg && <span className="text-xs text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}
