import Link from "next/link";
import { notFound } from "next/navigation";
import { partyDetail } from "@/lib/queries";
import { Card, StanceBar, StanceLegend, Verdict, Position, Salience, ThemeChip, fmtDate, fmtStance, Empty } from "@/components/ui";
import { THEMES, THEME_BY_ID } from "@/lib/config/themes";
import { HandlesEditor } from "@/components/handles-editor";

export const dynamic = "force-dynamic";

export default async function PartyPage(props: PageProps<"/partis/[id]">) {
  const { id } = await props.params;
  const d = partyDetail(id);
  if (!d) notFound();
  const { party, scores, docs, docAnalyses, members, recentVotes, posts, claims, docSummaries } = d;
  const deputes = members.filter((m) => m.chamber === "AN");
  const senateurs = members.filter((m) => m.chamber === "SENAT");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-3 h-12 rounded-full" style={{ background: party.color }} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{party.name}</h1>
            <div className="text-sm text-ink-2">
              {party.family} · {deputes.length} députés · {senateurs.length} sénateurs{party.leaders.length ? ` · ${party.leaders.join(", ")}` : ""}
              {party.website && (
                <>
                  {" · "}
                  <a href={party.website} target="_blank" rel="noreferrer" className="underline">
                    site
                  </a>
                </>
              )}
            </div>
            {party.notes && <p className="text-xs text-ink-3 mt-1">{party.notes}</p>}
          </div>
        </div>
        <StanceLegend />
      </div>

      <Card title="Dire / faire, thème par thème">
        <div className="space-y-5">
          {THEMES.map((t) => {
            const s = scores.find((x) => x.theme === t.id);
            const da = docAnalyses.filter((x) => x.theme === t.id);
            return (
              <div key={t.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Link href={`/themes/${t.id}`} className="font-semibold hover:underline">
                    {t.emoji} {t.label}
                  </Link>
                  <Verdict v={s?.verdict} />
                  <span className="text-xs text-ink-3 ml-auto tabular-nums">
                    déclaré {fmtStance(s?.declaredStance)} · voté {fmtStance(s?.votedStance)} ({s?.votedN ?? 0} votes){s?.senatStance != null ? ` · Sénat ${fmtStance(s.senatStance)}` : ""}
                    {s?.postsN ? ` · tweets ${fmtStance(s.postsStance)} (${s.postsN})` : ""}
                  </span>
                </div>
                <StanceBar declared={s?.declaredStance} voted={s?.votedStance} posts={s?.postsStance} showScale labelLeft={t.poleLeft} labelRight={t.poleRight} />
                {s?.narrative ? <p className="text-sm mt-3 leading-relaxed">{s.narrative}</p> : <p className="text-xs text-ink-3 mt-2">Pas encore de synthèse — lancez « Synthèses dire / faire ».</p>}
                {da.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-ink-2">Ce que dit le programme ({da.length} source{da.length > 1 ? "s" : ""})</summary>
                    {da.map((x) => (
                      <div key={`${x.documentId}`} className="mt-2 pl-3 border-l-2 border-border">
                        <div className="text-xs text-ink-3">
                          {x.doc_title} · stance {fmtStance(x.stance)} · confiance {Math.round(x.confidence * 100)} %
                        </div>
                        <p className="mt-1">{x.summary}</p>
                        <ul className="list-disc pl-5 mt-1 text-ink-2">
                          {(JSON.parse(x.measures as unknown as string) as string[]).map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                        {(JSON.parse(x.quotes as unknown as string) as string[]).map((q, i) => (
                          <blockquote key={i} className="text-ink-2 italic mt-1">
                            « {q} »
                          </blockquote>
                        ))}
                      </div>
                    ))}
                  </details>
                )}
                {s?.evidence && s.evidence.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-ink-2">Votes clés ({s.evidence.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {s.evidence.slice(0, 12).map((e) => (
                        <li key={e.scrutinUid} className="flex gap-2 items-start">
                          <span className="text-xs text-ink-3 w-20 shrink-0">{fmtDate(e.date)}</span>
                          <Position p={e.position} />
                          <Link href={`/scrutins/${e.scrutinUid}`} className="hover:underline min-w-0">
                            {e.title}
                          </Link>
                          {e.note && <span className="text-xs text-ink-3">— {e.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Programmes et documents analysés">
          {docs.length === 0 ? (
            <Empty>Aucun document. Lancez « Trouver les programmes » ou ajoutez une source dans Données &amp; jobs.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {docs.map((doc) => (
                <li key={doc.id} className="border-b border-border pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] rounded px-1.5 py-0.5 ${doc.status === "analyzed" ? "bg-good/10 text-good" : doc.status === "error" ? "bg-bad/10 text-bad" : "bg-surface-2 text-ink-3"}`}>{doc.status}</span>
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noreferrer" className="hover:underline font-medium">
                        {doc.title}
                      </a>
                    ) : (
                      <span className="font-medium">{doc.title}</span>
                    )}
                    <span className="text-xs text-ink-3">{doc.discoveredBy === "manual" ? "ajout manuel" : "trouvé par Claude"}</span>
                  </div>
                  {docSummaries[String(doc.id)] && (
                    <p className="text-ink-2 mt-1">
                      <span className="text-xs text-ink-3">{docSummaries[String(doc.id)].period} — </span>
                      {docSummaries[String(doc.id)].summary}
                    </p>
                  )}
                  {doc.error && <p className="text-xs text-warn mt-1">{doc.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Votes majeurs récents (position du groupe)">
          {recentVotes.length === 0 ? (
            <Empty>Aucun vote classifié comme majeur pour ce parti.</Empty>
          ) : (
            <ul className="space-y-2 text-sm max-h-[520px] overflow-y-auto pr-1">
              {recentVotes.map((v) => (
                <li key={v.uid} className="flex gap-2 items-start">
                  <span className="text-xs text-ink-3 w-20 shrink-0">{fmtDate(v.date)}</span>
                  <span className="w-14 shrink-0">
                    <Position p={v.position} />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/scrutins/${v.uid}`} className="hover:underline">
                      {v.summary ?? v.title}
                    </Link>
                    <div className="text-[11px] text-ink-3 flex gap-2 items-center">
                      <Salience s={v.salience} /> {v.theme && <ThemeChip id={v.theme} />} {v.chamber === "SENAT" ? "Sénat" : "AN"} · {v.pour}/{v.contre}/{v.abstentions} · {v.sort}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Sur X : affirmations vérifiées contre les votes">
          {claims.length === 0 ? (
            <Empty>Aucune affirmation vérifiée. Connectez X puis lancez « Analyser les tweets » et « Vérifier les affirmations ».</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {claims.map((c) => (
                <li key={c.id} className="border-b border-border pb-2 last:border-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Verdict v={c.verdict} />
                    <span className="text-xs text-ink-3">
                      @{c.handle} · {fmtDate(c.created_at)}
                    </span>
                    {c.theme && <ThemeChip id={c.theme} />}
                  </div>
                  <p className="mt-1 font-medium">« {c.claim} »</p>
                  <p className="text-ink-2 mt-1">{c.explanation}</p>
                  {(JSON.parse(c.evidence as unknown as string) as { scrutinUid: string; title: string; note?: string }[]).slice(0, 3).map((e) => (
                    <Link key={e.scrutinUid} href={`/scrutins/${e.scrutinUid}`} className="block text-xs text-ink-3 hover:underline truncate">
                      ↳ {e.title}
                    </Link>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Derniers tweets" action={<HandlesEditor partyId={party.id} handles={party.xHandles} />}>
          {posts.length === 0 ? (
            <Empty>Aucun tweet importé pour {party.xHandles.length ? party.xHandles.map((h) => `@${h}`).join(", ") : "ce parti (aucun compte configuré)"}.</Empty>
          ) : (
            <ul className="space-y-2 text-sm max-h-[520px] overflow-y-auto pr-1">
              {posts.map((p) => (
                <li key={p.id} className="border-b border-border pb-2 last:border-0">
                  <div className="text-xs text-ink-3 flex gap-2 flex-wrap items-center">
                    <span>@{p.handle}</span>
                    <span>{fmtDate(p.createdAt)}</span>
                    {p.tone && <span className="rounded bg-surface-2 px-1">{p.tone}</span>}
                    {p.a_themes && (JSON.parse(p.a_themes) as { theme: string; stance: number }[]).map((t) => (
                      <span key={t.theme} className="rounded bg-surface-2 px-1">
                        {THEME_BY_ID[t.theme]?.emoji} {fmtStance(t.stance)}
                      </span>
                    ))}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer" className="underline ml-auto">
                        voir
                      </a>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{p.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Parlementaires (${members.length})`}>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-ink-3 mb-1">Députés ({deputes.length})</h3>
            <div className="flex flex-wrap gap-1">
              {deputes.map((m) => (
                <Link key={m.id} href={`/parlementaires/${m.id}`} className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-accent">
                  {m.fullName}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-ink-3 mb-1">Sénateurs ({senateurs.length})</h3>
            <div className="flex flex-wrap gap-1">
              {senateurs.map((m) => (
                <Link key={m.id} href={`/parlementaires/${m.id}`} className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-accent">
                  {m.fullName}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
