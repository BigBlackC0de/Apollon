import Link from "next/link";
import { notFound } from "next/navigation";
import { themeDetail } from "@/lib/queries";
import { THEME_BY_ID } from "@/lib/config/themes";
import { Card, StanceBar, StanceLegend, Verdict, Position, Salience, fmtDate, fmtStance, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ThemePage(props: PageProps<"/themes/[id]">) {
  const { id } = await props.params;
  const theme = THEME_BY_ID[id];
  if (!theme) notFound();
  const { parties, scrutins } = themeDetail(id);
  const withData = parties.filter((p) => p.votedStance !== null || p.declaredStance !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {theme.emoji} {theme.label}
        </h1>
        <p className="text-sm text-ink-2 mt-1">{theme.scope}</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs max-w-3xl">
          <div className="rounded-lg p-2 border border-left/30 bg-left/5">
            <span className="font-medium text-left">−1</span> {theme.poleLeft}
          </div>
          <div className="rounded-lg p-2 border border-right/30 bg-right/5">
            <span className="font-medium text-right">+1</span> {theme.poleRight}
          </div>
        </div>
      </div>

      <Card title="Où se situe chaque parti" action={<StanceLegend />}>
        {withData.length === 0 ? (
          <Empty>Aucune position calculée sur ce thème.</Empty>
        ) : (
          <div className="space-y-4">
            {parties.map((p) => (
              <div key={p.id} className="grid md:grid-cols-[180px_1fr_200px] gap-3 items-center">
                <Link href={`/partis/${p.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
                </Link>
                <StanceBar declared={p.declaredStance} voted={p.votedStance} posts={p.postsStance} />
                <div className="text-xs text-ink-3 tabular-nums flex items-center gap-2">
                  <Verdict v={p.verdict} />
                  <span>
                    déclaré {fmtStance(p.declaredStance)} · voté {fmtStance(p.votedStance)} ({p.votedN ?? 0})
                  </span>
                </div>
                {p.narrative && <p className="md:col-span-3 text-sm text-ink-2 -mt-1">{p.narrative}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Scrutins les plus importants sur ce thème (${scrutins.length})`}>
        {scrutins.length === 0 ? (
          <Empty>Aucun scrutin classifié sur ce thème.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-3 text-left">
                  <th className="py-1 pr-2 font-medium">Date</th>
                  <th className="py-1 pr-2 font-medium">Vote</th>
                  <th className="py-1 pr-2 font-medium">Sens d&apos;un POUR</th>
                  {parties.filter((p) => scrutins.some((s) => s.positions[p.id])).map((p) => (
                    <th key={p.id} className="py-1 px-1 font-medium text-center">
                      <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: p.color }} />
                      {p.short_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scrutins.map((s) => (
                  <tr key={s.uid} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-xs text-ink-3">
                      {fmtDate(s.date)}
                      <br />
                      {s.chamber === "SENAT" ? "Sénat" : "AN"}
                    </td>
                    <td className="py-1.5 pr-2 min-w-[260px]">
                      <Link href={`/scrutins/${s.uid}`} className="hover:underline">
                        {s.summary}
                      </Link>
                      <div className="text-[11px] text-ink-3">
                        <Salience s={s.salience} /> · {s.sort}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-xs whitespace-nowrap">{s.direction === 1 ? <span className="text-right font-medium">→ +1</span> : s.direction === -1 ? <span className="text-left font-medium">← −1</span> : <span className="text-ink-3">neutre</span>}</td>
                    {parties.filter((p) => scrutins.some((x) => x.positions[p.id])).map((p) => (
                      <td key={p.id} className="py-1.5 px-1 text-center">
                        <Position p={s.positions[p.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
