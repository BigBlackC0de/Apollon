/**
 * CLI Apollon — mêmes jobs que l'interface, utilisables en ligne de commande / cron.
 *
 *   npm run job -- ingest-an
 *   npm run job -- classify-scrutins --limit 200
 *   npm run job -- synthesize --force
 *   npm run job -- refresh-all --budget 40
 */
import "dotenv/config";
import { launchJob, JOB_KINDS, type JobKind } from "../src/lib/pipeline";
import { waitJob } from "../src/lib/jobs";

async function main() {
  const [kind, ...rest] = process.argv.slice(2);
  if (!kind || !(kind in JOB_KINDS)) {
    console.log("Jobs disponibles :\n" + Object.entries(JOB_KINDS).map(([k, v]) => `  ${k.padEnd(20)} ${v.label} — ${v.desc}`).join("\n"));
    process.exit(kind ? 1 : 0);
  }
  const params: Record<string, unknown> = {};
  let budget: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--limit") params.limit = Number(rest[++i]);
    else if (a === "--chamber") params.chamber = rest[++i];
    else if (a === "--party") params.partyIds = rest[++i].split(",");
    else if (a === "--theme") params.themes = rest[++i].split(",");
    else if (a === "--force") params.force = true;
    else if (a === "--budget") budget = Number(rest[++i]);
  }
  const { id, error } = launchJob(kind as JobKind, params, budget);
  if (error || !id) {
    console.error(error);
    process.exit(1);
  }
  const job = await waitJob(id);
  console.log(`\n${job?.status?.toUpperCase()} — ${job?.message} — coût Claude ${job?.costUsd.toFixed(2)} $ (${job?.inputTokens} in / ${job?.outputTokens} out, ${job?.cacheReadTokens} cache)`);
  process.exit(job?.status === "done" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
