import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { ask } from "@/lib/claude/ask";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { question?: string; history?: { role: "user" | "assistant"; content: string }[] };
  if (!body.question?.trim()) return Response.json({ error: "question vide" }, { status: 400 });
  try {
    const history: Anthropic.MessageParam[] = (body.history ?? []).slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const r = await ask(body.question, history);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
