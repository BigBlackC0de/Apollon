import Link from "next/link";
import { partyOverviews } from "@/lib/queries";
import { Card, StanceBar, Verdict } from "@/components/ui";
import { THEMES } from "@/lib/config/themes";

export const dynamic = "force-dynamic";

export default function PartiesPage() {
  const parties = partyOverviews();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Les partis, de gauche à droite</h1>
      <p className="text-sm text-ink-2">Ordre d&apos;affichage conventionnel. Les positions réelles sont calculées à partir des programmes et des votes.</p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {parties.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start gap-3">
              <span className="w-3 h-10 rounded-full shrink-0" style={{ background: p.color }} />
              <div className="min-w-0 flex-1">
                <Link href={`/partis/${p.id}`} className="font-semibold hover:underline">
                  {p.name}
                </Link>
                <div className="text-xs text-ink-3">
                  {p.family} · {p.deputes} député{p.deputes > 1 ? "s" : ""} · {p.senateurs} sénateur{p.senateurs > 1 ? "s" : ""}
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="text-ink-3">écart moyen</div>
                <div className="font-semibold tabular-nums">{p.avgGap === null ? "—" : p.avgGap.toFixed(2)}</div>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {THEMES.slice(0, 8).map((t) => {
                const s = p.scores.find((x) => x.theme === t.id);
                return (
                  <li key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="w-36 truncate text-ink-2">
                      {t.emoji} {t.label}
                    </span>
                    <div className="flex-1">
                      <StanceBar declared={s?.declaredStance} voted={s?.votedStance} height={7} />
                    </div>
                    <span className="w-24 text-right">
                      <Verdict v={s?.verdict} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
