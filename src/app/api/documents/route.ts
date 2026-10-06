import { NextRequest } from "next/server";
import { addManualDocument } from "@/lib/claude/programmes";
import { getParty } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const b = (await req.json()) as { partyId?: string; title?: string; url?: string; text?: string; kind?: string };
  if (!b.partyId || !getParty(b.partyId)) return Response.json({ error: "parti inconnu" }, { status: 400 });
  if (!b.title) return Response.json({ error: "titre requis" }, { status: 400 });
  if (!b.url && !(b.text && b.text.trim().length > 200)) return Response.json({ error: "URL ou texte (200+ caractères) requis" }, { status: 400 });
  const id = addManualDocument({ partyId: b.partyId, title: b.title, url: b.url || undefined, text: b.text || undefined, kind: b.kind });
  return Response.json({ id });
}
