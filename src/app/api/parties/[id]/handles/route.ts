import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/parties/[id]/handles">) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { handles?: string[] };
  if (!Array.isArray(b.handles)) return Response.json({ error: "handles requis" }, { status: 400 });
  const handles = b.handles.map((h) => String(h).replace(/^@/, "").trim()).filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h));
  const r = getDb().update(schema.parties).set({ xHandles: handles }).where(eq(schema.parties.id, id)).run();
  if (!r.changes) return Response.json({ error: "parti inconnu" }, { status: 404 });
  return Response.json({ handles });
}
