import Link from "next/link";
import { partyOverviews } from "@/lib/queries";
import { THEMES } from "@/lib/config/themes";
import { Card, StanceBar, StanceLegend, Verdict, fmtStance } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ComparePage(props: PageProps<"/comparer">) {
  const sp = await props.searchParams;
  const all = partyOverviews();
  const raw = sp.p;
  const selected = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((id) => all.some((p) => p.id === id));
  const chosen = selected.length ? all.filter((p) => selected.includes(p.id)) : all.filter((p) => ["lfi", "ps", "renaissance", "lr", "rn"].includes(p.id));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Comparer des partis</h1>
      <Card>
        <form method="get" className="flex flex-wrap gap-2 text-sm items-center">
          {all.map((p) => (
            <label key={p.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 cursor-pointer has-[:checked]:bg-surface-2">
              <input type="checkbox" name="p" value={p.id} defaultChecked={chosen.some((c) => c.id === p.id)} className="accent-current" />
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.shortName}
            </label>
          ))}
          <button className="rounded-md bg-ink text-bg px-3 py-1.5 ml-auto">Comparer</button>
        </form>
      </Card>
      <StanceLegend />
      <div className="space-y-3">
        {THEMES.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <Link href={`/themes/${t.id}`} className="font-semibold hover:underline">
                {t.emoji} {t.label}
              </Link>
              <span className="text-[11px] text-ink-3 hidden md:block">
                ← {t.poleLeft.split(",")[0]} · {t.poleRight.split(",")[0]} →
              </span>
            </div>
            <div className="space-y-2">
              {chosen.map((p) => {
                const s = p.scores.find((x) => x.theme === t.id);
                return (
                  <div key={p.id} className="grid grid-cols-[110px_1fr_150px] gap-3 items-center text-sm">
                    <Link href={`/partis/${p.id}`} className="flex items-center gap-1.5 hover:underline truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                      {p.shortName}
                    </Link>
                    <StanceBar declared={s?.declaredStance} voted={s?.votedStance} posts={s?.postsStance} height={9} />
                    <div className="text-xs text-ink-3 tabular-nums flex items-center gap-1">
                      <Verdict v={s?.verdict} /> <span>{fmtStance(s?.declaredStance)} / {fmtStance(s?.votedStance)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
