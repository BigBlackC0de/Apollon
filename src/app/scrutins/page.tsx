import Link from "next/link";
import { listScrutins, allParties } from "@/lib/queries";
import { THEMES } from "@/lib/config/themes";
import { Card, Position, Salience, ThemeChip, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ScrutinsPage(props: PageProps<"/scrutins">) {
  const sp = await props.searchParams;
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const q = get("q") ?? "";
  const theme = get("theme") ?? "";
  const chamber = get("chamber") ?? "";
  const party = get("party") ?? "";
  const position = get("position") ?? "";
  const major = get("major") === "1";
  const page = Number(get("page") ?? 1);
  const res = listScrutins({ q, theme: theme || undefined, chamber: chamber || undefined, party: party || undefined, position: position || undefined, page, minSalience: major ? 4 : undefined });
  const parties = allParties();
  const pages = Math.ceil(res.total / res.pageSize);
  const link = (p: number) => `/scrutins?${new URLSearchParams({ q, theme, chamber, party, position, major: major ? "1" : "", page: String(p) })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Scrutins</h1>
      <Card>
        <form className="grid md:grid-cols-6 gap-2 text-sm" method="get">
          <input name="q" defaultValue={q} placeholder="Mots-clés (retraites, OQTF, 49.3…)" className="md:col-span-2 border border-border rounded-md px-3 py-1.5 bg-surface" />
          <select name="theme" defaultValue={theme} className="border border-border rounded-md px-2 py-1.5 bg-surface">
            <option value="">Tous les thèmes</option>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
          <select name="chamber" defaultValue={chamber} className="border border-border rounded-md px-2 py-1.5 bg-surface">
            <option value="">AN + Sénat</option>
            <option value="AN">Assemblée</option>
            <option value="SENAT">Sénat</option>
          </select>
          <div className="flex gap-1">
            <select name="party" defaultValue={party} className="border border-border rounded-md px-2 py-1.5 bg-surface flex-1">
              <option value="">Parti…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortName}
                </option>
              ))}
            </select>
            <select name="position" defaultValue={position} className="border border-border rounded-md px-2 py-1.5 bg-surface">
              <option value="">a voté…</option>
              <option value="pour">pour</option>
              <option value="contre">contre</option>
              <option value="abstention">abst.</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="major" value="1" defaultChecked={major} /> majeurs
            </label>
            <button className="rounded-md bg-ink text-bg px-3 py-1.5">Filtrer</button>
          </div>
        </form>
      </Card>
      <div className="text-xs text-ink-3">
        {res.total.toLocaleString("fr-FR")} scrutins · page {res.page}/{Math.max(1, pages)}
      </div>
      <ul className="space-y-2">
        {res.rows.map((r) => (
          <li key={r.uid} className="card p-3">
            <div className="flex gap-3">
              <div className="text-xs text-ink-3 w-20 shrink-0">
                {fmtDate(r.date)}
                <br />
                {r.chamber === "SENAT" ? "Sénat" : "AN"}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/scrutins/${r.uid}`} className="font-medium hover:underline">
                  {r.summary ?? r.title}
                </Link>
                {r.summary && <div className="text-xs text-ink-3 truncate">{r.title}</div>}
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-ink-3">
                  <Salience s={r.salience} />
                  {r.theme && <ThemeChip id={r.theme} />}
                  {r.procedural ? <span className="rounded bg-surface-2 px-1">procédure</span> : null}
                  <span>
                    {r.sort} · {r.pour} pour / {r.contre} contre / {r.abstentions} abst.
                  </span>
                  {!r.salience && <span className="italic">non classifié</span>}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[11px]">
                  {r.groups
                    .filter((g) => g.position)
                    .sort((a, b) => (parties.find((p) => p.id === a.party_id)?.lrIndex ?? 999) - (parties.find((p) => p.id === b.party_id)?.lrIndex ?? 999))
                    .map((g) => (
                      <span key={g.group_abbrev ?? g.party_id ?? ""} className="inline-flex items-center gap-1">
                        <span className="text-ink-3">{g.group_abbrev}</span>
                        <Position p={g.position} />
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex gap-2 text-sm">
          {page > 1 && (
            <Link href={link(page - 1)} className="underline">
              ← précédent
            </Link>
          )}
          {page < pages && (
            <Link href={link(page + 1)} className="underline">
              suivant →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
