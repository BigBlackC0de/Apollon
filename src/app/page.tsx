import Link from "next/link";
import { partyOverviews, dataStatus, themeStats } from "@/lib/queries";
import { Compass } from "@/components/compass";
import { Card, StanceBar, StanceLegend, Verdict, fmtStance, Empty } from "@/components/ui";
import { THEMES } from "@/lib/config/themes";

export const dynamic = "force-dynamic";

export default function Home() {
  const parties = partyOverviews();
  const status = dataStatus();
  const themes = themeStats();
  const ready = status.classified > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ce que les partis disent. Ce qu&apos;ils votent.</h1>
          <p className="text-ink-2 text-sm mt-1 max-w-2xl">
            Apollon confronte les programmes, les {status.scrutinsAN.toLocaleString("fr-FR")} scrutins de l&apos;Assemblée, les {status.scrutinsSenat.toLocaleString("fr-FR")} scrutins du Sénat et les prises de parole sur X, thème par thème, pour mesurer l&apos;écart entre le discours et les actes.
          </p>
        </div>
        <div className="text-xs text-ink-3 md:text-right">
          Dernier scrutin : {status.lastScrutin ?? "—"} · {status.classified.toLocaleString("fr-FR")} scrutins classifiés · {status.syntheses} synthèses
        </div>
      </div>

      {!ready && (
        <div className="card p-5 border-accent/50 bg-accent/5">
          <h2 className="font-semibold">Première mise en route</h2>
          <ol className="list-decimal pl-5 text-sm mt-2 space-y-1 text-ink-2">
            <li>Renseignez <code>ANTHROPIC_API_KEY</code> dans <code>.env</code> (ou connectez-vous avec <code>ant auth login</code>).</li>
            <li>
              Dans <Link href="/sources" className="underline">Données &amp; jobs</Link>, lancez « Classifier les scrutins » (Claude lit chaque vote et lui attribue thèmes et sens). Les imports AN/Sénat sont déjà faits si des scrutins apparaissent ci-dessus.
            </li>
            <li>Puis « Trouver les programmes » → « Analyser les programmes » → « Synthèses dire / faire ».</li>
          </ol>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3" title="Boussole : programme vs votes">
          <Compass parties={parties.map((p) => ({ id: p.id, shortName: p.shortName, name: p.name, color: p.color, declared: p.compass.declared, voted: p.compass.voted }))} />
        </Card>
        <Card className="lg:col-span-2" title="Écart dire / faire par parti">
          <p className="text-xs text-ink-3 mb-3">Moyenne des écarts |déclaré − voté| sur les thèmes documentés (0 = parfaitement cohérent, 2 = opposé).</p>
          <ul className="space-y-2">
            {parties
              .filter((p) => p.deputes > 0 || p.avgGap !== null)
              .sort((a, b) => (b.avgGap ?? -1) - (a.avgGap ?? -1))
              .map((p) => (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                  <Link href={`/partis/${p.id}`} className="w-28 shrink-0 font-medium hover:underline truncate">
                    {p.shortName}
                  </Link>
                  <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    {p.avgGap !== null && <div className="h-full rounded-full" style={{ width: `${Math.min(100, (p.avgGap / 1.2) * 100)}%`, background: p.avgGap > 0.6 ? "var(--bad)" : p.avgGap > 0.3 ? "var(--warn)" : "var(--good)" }} />}
                  </div>
                  <span className="w-12 text-right tabular-nums text-ink-2">{p.avgGap === null ? "—" : p.avgGap.toFixed(2)}</span>
                  <span className="w-20 text-right text-xs text-ink-3">{p.deputes} dép.</span>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <Card title="Positions par thème" action={<StanceLegend />}>
        {!ready ? (
          <Empty>Les positions apparaîtront après la classification des scrutins.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="py-2 pr-3 font-medium">Thème</th>
                  {parties.filter((p) => p.deputes > 0 || p.scores.some((s) => s.declaredStance !== null)).map((p) => (
                    <th key={p.id} className="py-2 px-1 font-medium text-center min-w-[72px]">
                      <Link href={`/partis/${p.id}`} className="inline-flex items-center gap-1 hover:underline">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        {p.shortName}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {THEMES.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link href={`/themes/${t.id}`} className="hover:underline">
                        {t.emoji} {t.label}
                      </Link>
                      <div className="text-[11px] text-ink-3">{themes.find((x) => x.id === t.id)?.n ?? 0} scrutins</div>
                    </td>
                    {parties.filter((p) => p.deputes > 0 || p.scores.some((s) => s.declaredStance !== null)).map((p) => {
                      const s = p.scores.find((x) => x.theme === t.id);
                      return (
                        <td key={p.id} className="py-2 px-1 align-middle">
                          <div className="w-16 mx-auto">
                            <StanceBar declared={s?.declaredStance} voted={s?.votedStance} posts={s?.postsStance} height={8} />
                          </div>
                          <div className="text-center text-[11px] text-ink-3 mt-1 tabular-nums" title={`déclaré ${fmtStance(s?.declaredStance)} / voté ${fmtStance(s?.votedStance)}`}>
                            {s?.verdict ? <Verdict v={s.verdict} /> : fmtStance(s?.votedStance)}
                          </div>
                        </td>
                      );
                    })}
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
