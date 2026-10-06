import { NextRequest } from "next/server";
import { importPosts } from "@/lib/claude/posts";

export async function POST(req: NextRequest) {
  const b = (await req.json()) as { partyId?: string; handle?: string; raw?: string };
  if (!b.handle || !b.raw) return Response.json({ error: "handle et contenu requis" }, { status: 400 });
  const handle = b.handle.replace(/^@/, "");
  const items: Parameters<typeof importPosts>[0] = [];
  const raw = b.raw.trim();
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw) as { id?: string; text?: string; full_text?: string; created_at?: string; url?: string }[];
      for (const t of arr) {
        const text = t.text ?? t.full_text;
        if (!text) continue;
        const date = t.created_at ? new Date(t.created_at) : new Date();
        items.push({ id: t.id ? String(t.id) : undefined, handle, text, createdAt: isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(), url: t.url, partyId: b.partyId ?? null });
      }
    } catch {
      return Response.json({ error: "JSON invalide" }, { status: 400 });
    }
  } else {
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(\d{4}-\d{2}-\d{2})\s*[\t|]?\s*(.+)$/);
      if (m) items.push({ handle, text: m[2].trim(), createdAt: `${m[1]}T12:00:00.000Z`, partyId: b.partyId ?? null });
      else if (line.trim()) items.push({ handle, text: line.trim(), createdAt: new Date().toISOString(), partyId: b.partyId ?? null });
    }
  }
  return Response.json({ count: importPosts(items) });
}
