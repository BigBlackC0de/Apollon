import Link from "next/link";
import { notFound } from "next/navigation";
import { politicianDetail } from "@/lib/queries";
import { THEMES } from "@/lib/config/themes";
import { Card, StanceBar, Position, Salience, ThemeChip, fmtDate, fmtStance, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PoliticianPage(props: PageProps<"/parlementaires/[id]">) {
  const { id } = await props.params;
  const d = politicianDetail(id);
  if (!d) notFound();
  const { politician: p, party, scores, partyScores, votes, stats, posts } = d;
  const dissentRate = stats.compared ? stats.dissent / stats.compared : null;
  const absentRate = stats.total ? stats.absents / stats.total : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="w-3 h-12 rounded-full" style={{ background: party?.color ?? "var(--neutral)" }} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.fullName}</h1>
          <div className="text-sm text-ink-2">
            {p.chamber === "AN" ? "Député·e" : "Sénateur·rice"} {p.department ? `· ${p.department}${p.circo ? ` (${p.circo}e circ.)` : ""}` : ""} · groupe {p.groupName ?? p.groupAbbrev ?? "—"}
            {party && (
              <>
                {" · "}
                <Link href={`/partis/${party.id}`} className="underline">
                  {party.name}
                </Link>
              </>
            )}
            {p.parpol && p.parpol !== party?.name && <span className="text-ink-3"> (parti déclaré : {p.parpol})</span>}
          </div>
          {p.hatvpUrl && (
            <a href={p.hatvpUrl} target="_blank" rel="noreferrer" className="text-xs underline text-ink-3">
              déclaration d&apos;intérêts (HATVP)
            </a>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-ink-3">Scrutins enregistrés</div>
          <div className="text-2xl font-semibold tabular-nums">{stats.total.toLocaleString("fr-FR")}</div>
        </Card>
        <Card>
          <div className="text-xs text-ink-3">Absent / non votant</div>
          <div className="text-2xl font-semibold tabular-nums">{absentRate === null ? "—" : `${Math.round(absentRate * 100)} %`}</div>
        </Card>
        <Card>
          <div className="text-xs text-ink-3">Votes divergents de son groupe</div>
          <div className="text-2xl font-semibold tabular-nums">{dissentRate === null ? "—" : `${(dissentRate * 100).toFixed(1)} %`}</div>
        </Card>
      </div>

      <Card title="Positions votées, comparées à celles du parti">
        <p className="text-xs text-ink-3 mb-3">Disque = ce parlementaire · anneau = ligne du parti (votes de groupe) · −1 / +1 selon l&apos;axe du thème.</p>
        {scores.length === 0 ? (
          <Empty>Aucun score (scrutins non classifiés, ou parlementaire sans vote enregistré).</Empty>
        ) : (
          <div className="space-y-2">
            {THEMES.map((t) => {
              const s = scores.find((x) => x.theme === t.id);
              const ps = partyScores.find((x) => x.theme === t.id);
              if (!s) return null;
              return (
                <div key={t.id} className="grid md:grid-cols-[200px_1fr_180px] gap-3 items-center text-sm">
                  <Link href={`/themes/${t.id}`} className="hover:underline">
                    {t.emoji} {t.label}
                  </Link>
                  <StanceBar voted={s.votedStance} declared={ps?.votedStance} height={8} />
                  <div className="text-xs text-ink-3 tabular-nums">
                    {fmtStance(s.votedStance)} sur {s.votedN} votes{s.dissentRate !== null ? ` · ${Math.round(s.dissentRate * 100)} % hors ligne` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Votes les plus importants">
        <ul className="space-y-2 text-sm">
          {votes.map((v) => (
            <li key={v.uid} className="flex gap-2 items-start">
              <span className="text-xs text-ink-3 w-20 shrink-0">{fmtDate(v.date)}</span>
              <span className="w-14 shrink-0">
                <Position p={v.position} />
              </span>
              <div className="min-w-0">
                <Link href={`/scrutins/${v.uid}`} className="hover:underline">
                  {v.summary ?? v.title}
                </Link>
                <div className="text-[11px] text-ink-3 flex flex-wrap gap-2 items-center">
                  <Salience s={v.salience} /> {v.theme && <ThemeChip id={v.theme} />} {v.sort}
                  {v.group_position && v.group_position !== v.position && v.position !== "nonVotant" && <span className="text-warn">groupe : {v.group_position}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {posts.length > 0 && (
        <Card title="Derniers tweets">
          <ul className="space-y-2 text-sm">
            {posts.map((t) => (
              <li key={t.id} className="border-b border-border pb-2 last:border-0">
                <div className="text-xs text-ink-3">
                  @{t.handle} · {fmtDate(t.createdAt)}
                </div>
                <p className="whitespace-pre-wrap">{t.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
