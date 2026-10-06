import Link from "next/link";
import { searchPoliticians } from "@/lib/queries";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PoliticiansPage(props: PageProps<"/parlementaires">) {
  const sp = await props.searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const results = q ? searchPoliticians(q) : [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Députés et sénateurs</h1>
      <Card>
        <form method="get" className="flex gap-2 text-sm">
          <input name="q" defaultValue={q} placeholder="Nom ou département" className="flex-1 border border-border rounded-md px-3 py-1.5 bg-surface" autoFocus />
          <button className="rounded-md bg-ink text-bg px-3 py-1.5">Chercher</button>
        </form>
      </Card>
      {q && results.length === 0 && <Empty>Aucun parlementaire trouvé pour « {q} ».</Empty>}
      <ul className="grid md:grid-cols-2 gap-2">
        {results.map((p) => (
          <li key={p.id} className="card p-3 text-sm flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color ?? "var(--neutral)" }} />
            <Link href={`/parlementaires/${p.id}`} className="font-medium hover:underline">
              {p.fullName}
            </Link>
            <span className="text-xs text-ink-3">
              {p.chamber === "AN" ? "Député" : "Sénateur"} · {p.groupAbbrev ?? "sans groupe"} · {p.department ?? ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
