import Link from "next/link";
import { dataStatus, allParties, usageByTask } from "@/lib/queries";
import { JOB_KINDS } from "@/lib/pipeline";
import { xConfigured } from "@/lib/x/client";
import { engineInfo } from "@/lib/llm";
import { Card } from "@/components/ui";
import { JobsPanel } from "@/components/jobs-panel";
import { AddDocumentForm, ImportPostsForm } from "@/components/import-forms";
import { getDb, schema } from "@/lib/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SourcesPage(props: PageProps<"/sources">) {
  const sp = await props.searchParams;
  const status = dataStatus();
  const parties = allParties();
  const usage = usageByTask();
  const x = xConfigured();
  const eng = engineInfo();
  const claudeReady = eng.ready;
  const docs = getDb().select().from(schema.documents).orderBy(desc(schema.documents.id)).limit(40).all();
  const xMsg = (Array.isArray(sp.x) ? sp.x[0] : sp.x) as string | undefined;

  const stat = (label: string, value: string | number, hint?: string) => (
    <div className="card p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</div>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Données & jobs</h1>
        <p className="text-sm text-ink-2">
          Moteur : <strong>{eng.engine === "claude-code" ? "Claude Code (abonnement Claude du compte connecté, sans facturation à l'acte)" : "API Anthropic (clé API, facturation à l'usage)"}</strong>
          {eng.ready ? "" : eng.engine === "claude-code" ? " — exécutable `claude` introuvable" : " — clé API absente"} · modèle principal : <code>{eng.modelMain}</code> · masse : <code>{eng.modelBulk}</code> · valeur équivalente consommée : <strong>{status.costTotal.toFixed(2)} $</strong> (30 j : {status.cost30d.toFixed(2)} $)
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {stat("Députés actifs", status.deputes)}
        {stat("Sénateurs actifs", status.senateurs, "groupes des élus de sept. 2026 pas encore publiés")}
        {stat("Scrutins AN", status.scrutinsAN, `dernier : ${status.lastScrutin ?? "—"}`)}
        {stat("Scrutins Sénat", status.scrutinsSenat, "depuis juillet 2024")}
        {stat("Votes individuels", status.votes)}
        {stat("Scrutins classifiés", `${status.classified} / ${status.scrutinsAN + status.scrutinsSenat}`)}
        {stat("Programmes", `${status.documentsAnalyzed} / ${status.documents}`, "analysés / trouvés")}
        {stat("Tweets", `${status.postsAnalyzed} / ${status.posts}`, "analysés / importés")}
        {stat("Affirmations vérifiées", status.claims)}
        {stat("Synthèses dire/faire", status.syntheses, "sur 143 cellules")}
      </div>

      <Card title="Jobs">
        <JobsPanel kinds={Object.entries(JOB_KINDS).map(([id, v]) => ({ id, ...v }))} claudeReady={claudeReady} engine={eng.engine} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="X / Twitter">
          {xMsg && <p className="text-sm mb-2 text-ink-2">{xMsg}</p>}
          <p className="text-sm text-ink-2">
            Depuis février 2026, l&apos;API X n&apos;a plus de palier gratuit : lecture facturée ≈ 0,005 $ / tweet (paiement à l&apos;usage sur{" "}
            <a href="https://developer.x.com" className="underline" target="_blank" rel="noreferrer">
              developer.x.com
            </a>
            ). Deux modes : connecter votre compte (OAuth, recommandé) ou un bearer token d&apos;application. Le plafond <code>X_MAX_READS_PER_REFRESH</code> borne le coût.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 items-center text-sm">
            {x.connected ? (
              <>
                <span className="text-good">● Compte X connecté</span>
                <form action="/api/x/disconnect" method="post">
                  <button className="underline text-ink-3 text-xs">déconnecter</button>
                </form>
              </>
            ) : x.oauth ? (
              <a href="/api/x/auth" className="rounded bg-ink text-bg px-3 py-1.5">
                Connecter mon compte X
              </a>
            ) : (
              <span className="text-ink-3 text-xs">Renseignez X_CLIENT_ID / X_CLIENT_SECRET dans .env pour activer la connexion.</span>
            )}
            {x.bearer && <span className="text-xs text-ink-3">· bearer token configuré</span>}
          </div>
          <h3 className="font-medium text-sm mt-4 mb-1">Import manuel (sans API)</h3>
          <ImportPostsForm parties={parties} />
        </Card>

        <Card title="Ajouter un programme / document">
          <p className="text-sm text-ink-2 mb-2">Claude découvre les programmes via la recherche web, mais vous pouvez aussi ajouter une URL (PDF ou page) ou coller un texte.</p>
          <AddDocumentForm parties={parties} />
          <h3 className="font-medium text-sm mt-4 mb-1">Documents ({docs.length} derniers)</h3>
          <ul className="text-xs space-y-1 max-h-72 overflow-y-auto">
            {docs.map((d) => (
              <li key={d.id} className="flex gap-2 items-start">
                <span className={`rounded px-1 ${d.status === "analyzed" ? "bg-good/10 text-good" : d.status === "error" ? "bg-bad/10 text-bad" : "bg-surface-2 text-ink-3"}`}>{d.status}</span>
                <Link href={`/partis/${d.partyId}`} className="text-ink-3 shrink-0 hover:underline">
                  {parties.find((p) => p.id === d.partyId)?.shortName}
                </Link>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline truncate">
                    {d.title}
                  </a>
                ) : (
                  <span className="truncate">{d.title}</span>
                )}
                {d.error && <span className="text-warn truncate">{d.error}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={eng.engine === "claude-code" ? "Consommation Claude par tâche (valeur équivalente, incluse dans l'abonnement)" : "Dépenses Claude par tâche"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-3 text-left">
              <th className="py-1 font-medium">Tâche</th>
              <th className="py-1 font-medium">Modèle</th>
              <th className="py-1 font-medium text-right">Appels</th>
              <th className="py-1 font-medium text-right">Entrée</th>
              <th className="py-1 font-medium text-right">Cache</th>
              <th className="py-1 font-medium text-right">Sortie</th>
              <th className="py-1 font-medium text-right">Coût</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={`${u.task}-${u.model}`} className="border-t border-border tabular-nums">
                <td className="py-1">{u.task}</td>
                <td className="py-1 text-ink-3">{u.model}</td>
                <td className="py-1 text-right">{u.calls}</td>
                <td className="py-1 text-right">{(u.input / 1000).toFixed(0)}k</td>
                <td className="py-1 text-right">{(u.cache / 1000).toFixed(0)}k</td>
                <td className="py-1 text-right">{(u.output / 1000).toFixed(0)}k</td>
                <td className="py-1 text-right font-medium">{u.cost.toFixed(2)} $</td>
              </tr>
            ))}
            {usage.length === 0 && (
              <tr>
                <td colSpan={7} className="py-2 text-ink-3 text-xs">
                  Aucune dépense pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Sources et méthode">
        <ul className="text-sm space-y-1 text-ink-2 list-disc pl-5">
          <li>
            <strong>Assemblée nationale</strong> : open data officiel (data.assemblee-nationale.fr), XVIIe législature — députés, groupes, parti déclaré, scrutins et votes nominatifs. Mis à jour quotidiennement par l&apos;AN ; relancez « Importer » pour récupérer les nouveaux scrutins.
          </li>
          <li>
            <strong>Sénat</strong> : NosParlementaires (Licence Ouverte 2.0), qui normalise data.senat.fr. Les groupes des sénateurs élus en septembre 2026 ne sont pas encore publiés.
          </li>
          <li>
            <strong>Positions votées</strong> : pour chaque scrutin de fond, Claude détermine les thèmes et le sens d&apos;un vote POUR sur l&apos;axe ; la position d&apos;un parti est la moyenne pondérée (par importance) des positions majoritaires de son groupe. Les votes de procédure sont exclus.
          </li>
          <li>
            <strong>Positions déclarées</strong> : analyse des programmes officiels (PDF lus intégralement par Claude), pondérée par la confiance.
          </li>
          <li>
            <strong>Limites</strong> : un vote CONTRE un texte adverse n&apos;est pas toujours un désaccord de fond (logique majorité/opposition) ; les synthèses le signalent. L&apos;orientation des axes est une convention. Vérifiez les preuves citées.
          </li>
        </ul>
      </Card>
    </div>
  );
}
