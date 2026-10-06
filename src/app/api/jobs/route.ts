import { NextRequest } from "next/server";
import { launchJob, JOB_KINDS, type JobKind } from "@/lib/pipeline";
import { listJobs, cancelJob, reapOrphanJobs } from "@/lib/jobs";

let reaped = false;

export async function GET() {
  if (!reaped) {
    reapOrphanJobs();
    reaped = true;
  }
  return Response.json(listJobs(30));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { kind?: string; params?: Record<string, unknown>; budgetUsd?: number };
  if (!body.kind || !(body.kind in JOB_KINDS)) return Response.json({ error: "kind invalide" }, { status: 400 });
  const r = launchJob(body.kind as JobKind, body.params, body.budgetUsd);
  return Response.json(r, { status: r.error ? 409 : 200 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id manquant" }, { status: 400 });
  cancelJob(id);
  return Response.json({ ok: true });
}
