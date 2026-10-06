import Link from "next/link";
import { notFound } from "next/navigation";
import { scrutinDetail } from "@/lib/queries";
import { THEME_BY_ID } from "@/lib/config/themes";
import { Card, Position, Salience, ThemeChip, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ScrutinPage(props: PageProps<"/scrutins/[uid]">) {
  const { uid } = await props.params;
  const d = scrutinDetail(uid);
  if (!d) notFound();
  const { scrutin, analysis, groups, votes } = d;
  const byPos = (pos: string) => votes.filter((v) => v.position === pos);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-ink-3">
          {scrutin.chamber === "SENAT" ? "Sénat" : "Assemblée nationale"} · {fmtDate(scrutin.date)} · scrutin n° {scrutin.number}
          {scrutin.url && (
            <>
              {" · "}
              <a href={scrutin.url} target="_blank" rel="noreferrer" className="underline">
                source officielle
              </a>
            </>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight mt-1">{analysis?.summary ?? scrutin.title}</h1>
        {analysis && <p className="text-sm text-ink-2 mt-1">Intitulé officiel : {scrutin.title}</p>}
        {scrutin.objet && scrutin.objet !== scrutin.title && <p className="text-sm text-ink-2 mt-1">{scrutin.objet}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
          <span className={`font-semibold ${scrutin.sort === "adopté" ? "text-good" : "text-bad"}`}>{scrutin.sort ?? "?"}</span>
          <span className="text-ink-3">
            {scrutin.pour} pour · {scrutin.contre} contre · {scrutin.abstentions} abstentions · {scrutin.votants} votants
          </span>
          {scrutin.demandeur && <span className="text-xs text-ink-3">demandé par {scrutin.demandeur}</span>}
        </div>
      </div>

      {analysis ? (
        <Card title="Lecture d'Apollon">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Salience s={analysis.salience} />
            {analysis.isProcedural && <span className="text-xs rounded bg-surface-2 px-1.5">vote de procédure</span>}
            {analysis.themes.map((t) => (
              <span key={t.theme} className="inline-flex items-center gap-1 text-xs">
                <ThemeChip id={t.theme} />
                <span className="text-ink-3">
                  POUR = {t.direction === 1 ? `→ ${THEME_BY_ID[t.theme]?.poleRight.split(",")[0]}` : t.direction === -1 ? `← ${THEME_BY_ID[t.theme]?.poleLeft.split(",")[0]}` : "neutre"} ({Math.round(t.weight * 100)} %)
                </span>
              </span>
            ))}
          </div>
          {analysis.stakes && <p className="text-sm">{analysis.stakes}</p>}
          <p className="text-[11px] text-ink-3 mt-2">
            Classifié par {analysis.model} le {fmtDate(analysis.analyzedAt)}.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-ink-3">Scrutin non encore classifié par Claude.</p>
        </Card>
      )}

      <Card title="Position des groupes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-3 text-left">
                <th className="py-1 pr-2 font-medium">Groupe</th>
                <th className="py-1 pr-2 font-medium">Position majoritaire</th>
                <th className="py-1 pr-2 font-medium text-right">Pour</th>
                <th className="py-1 pr-2 font-medium text-right">Contre</th>
                <th className="py-1 pr-2 font-medium text-right">Abst.</th>
                <th className="py-1 pr-2 font-medium text-right">Non votants</th>
                <th className="py-1 pr-2 font-medium text-right">Membres</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.groupRef} className="border-t border-border">
                  <td className="py-1.5 pr-2">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: g.color ?? "var(--neutral)" }} />
                    {g.partyId ? (
                      <Link href={`/partis/${g.partyId}`} className="hover:underline">
                        {g.group_name ?? g.groupAbbrev}
                      </Link>
                    ) : (
                      g.group_name ?? g.groupAbbrev ?? g.groupRef
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <Position p={g.position} />
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{g.pour}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{g.contre}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{g.abstentions}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink-3">{g.nonVotants}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink-3">{g.members ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Votes nominatifs (${votes.length})`}>
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          {(["pour", "contre", "abstention"] as const).map((pos) => (
            <div key={pos}>
              <h3 className="mb-1">
                <Position p={pos} /> <span className="text-ink-3">({byPos(pos).length})</span>
              </h3>
              <div className="flex flex-wrap gap-1 max-h-80 overflow-y-auto">
                {byPos(pos).map((v) => (
                  <Link key={v.id} href={`/parlementaires/${v.id}`} className="rounded-full border border-border px-1.5 py-0.5 hover:border-accent" title={`${v.group_abbrev ?? ""} ${v.department ?? ""}`}>
                    {v.full_name}
                    {v.par_delegation ? " ⁺" : ""}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink-3 mt-2">⁺ vote par délégation. Les votes d&apos;anciens députés (remplacés en cours de législature) ne sont pas nommés.</p>
      </Card>
    </div>
  );
}
