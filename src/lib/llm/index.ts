import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { claude, MODEL, MODEL_BULK, trackUsage } from "../claude/client";
import { runClaudeCode, claudeCodeAvailable } from "./claude-code";
import type { JobContext } from "../jobs";

/**
 * Couche unique d'appel au modèle. Deux moteurs :
 *  - "api"         : SDK Anthropic (clé API, facturation à l'usage)
 *  - "claude-code" : binaire `claude -p` (abonnement Claude du compte connecté)
 * Choix : APOLLON_ENGINE=api|claude-code|auto (auto = clé API si présente, sinon Claude Code).
 */
export type Engine = "api" | "claude-code";

export function engine(): Engine {
  const e = (process.env.APOLLON_ENGINE ?? "auto").toLowerCase();
  if (e === "api") return "api";
  if (e === "claude-code") return "claude-code";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "api";
  return "claude-code";
}

export function engineInfo() {
  const e = engine();
  const ready = e === "api" ? !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) : claudeCodeAvailable();
  return { engine: e, ready, modelMain: modelFor("main"), modelBulk: modelFor("bulk") };
}

export function modelFor(kind: "main" | "bulk"): string {
  if (engine() === "claude-code") return (kind === "main" ? process.env.APOLLON_CC_MODEL : process.env.APOLLON_CC_MODEL_BULK) ?? process.env.APOLLON_CC_MODEL ?? "opus";
  return kind === "main" ? MODEL : MODEL_BULK;
}

export interface LlmRequest<T> {
  task: string;
  system: string;
  prompt: string;
  schema?: z.ZodType<T>;
  model?: "main" | "bulk";
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** "web" : recherche + lecture web. */
  tools?: "web"[];
  /** Document PDF à lire intégralement. */
  pdf?: { base64: string; title: string };
  /** Document texte long. */
  textDoc?: { text: string; title: string };
  ctx?: JobContext;
}

export interface LlmResult<T> {
  output: T | null;
  text: string;
  refusal: boolean;
  error?: string;
  costUsd: number;
  toolCalls: { name: string; input: unknown }[];
}

export async function llm<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
  return engine() === "api" ? llmApi(req) : llmClaudeCode(req);
}

/* ------------------------------------------------------------------ */
/* Moteur API                                                          */
/* ------------------------------------------------------------------ */

async function llmApi<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
  const model = modelFor(req.model ?? "main");
  const content: Anthropic.ContentBlockParam[] = [];
  if (req.pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: req.pdf.base64 }, title: req.pdf.title });
  if (req.textDoc) content.push({ type: "document", source: { type: "text", media_type: "text/plain", data: req.textDoc.text.slice(0, 1_500_000) }, title: req.textDoc.title });
  content.push({ type: "text", text: req.prompt });
  const tools: Anthropic.ToolUnion[] = [];
  if (req.tools?.includes("web")) {
    tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } });
    tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 6, max_content_tokens: 60000 });
  }
  const stream = claude().messages.stream({
    model,
    max_tokens: req.maxTokens ?? 16000,
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    ...(tools.length ? { tools } : {}),
    output_config: { effort: req.effort ?? "medium", ...(req.schema && !tools.length ? { format: zodOutputFormat(req.schema) } : {}) },
  });
  const res = await stream.finalMessage();
  const cost = trackUsage(req.task, model, res.usage, req.ctx);
  const toolCalls = res.content.filter((b) => b.type === "server_tool_use").map((b) => ({ name: (b as Anthropic.ServerToolUseBlock).name, input: (b as Anthropic.ServerToolUseBlock).input }));
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (res.stop_reason === "refusal") return { output: null, text, refusal: true, costUsd: cost, toolCalls, error: `Refus (${res.stop_details?.category ?? "?"})` };
  let output: T | null = null;
  if (req.schema && !tools.length) {
    try {
      output = req.schema.parse(JSON.parse(text));
    } catch (e) {
      return { output: null, text, refusal: false, costUsd: cost, toolCalls, error: `Sortie non conforme : ${(e as Error).message.slice(0, 200)}` };
    }
  }
  return { output, text, refusal: false, costUsd: cost, toolCalls };
}

/* ------------------------------------------------------------------ */
/* Moteur Claude Code                                                  */
/* ------------------------------------------------------------------ */

function docsDir(): string {
  const d = path.join(process.cwd(), "data", "docs");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function llmClaudeCode<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
  const model = modelFor(req.model ?? "main");
  const tools: string[] = [];
  const addDirs: string[] = [];
  let prompt = req.prompt;
  let maxTurns = 4;
  if (req.tools?.includes("web")) {
    tools.push("WebSearch", "WebFetch");
    maxTurns = 20;
  }
  if (req.pdf) {
    const file = path.join(docsDir(), `${crypto.createHash("sha1").update(req.pdf.base64.slice(0, 5000) + req.pdf.base64.length).digest("hex").slice(0, 16)}.pdf`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(req.pdf.base64, "base64"));
    tools.push("Read");
    addDirs.push(docsDir());
    maxTurns = Math.max(maxTurns, 80);
    prompt = `Le document à analyser est le fichier PDF « ${req.pdf.title} » situé ici : ${file}\nLis-le INTÉGRALEMENT avec l'outil Read (par tranches de pages si nécessaire, sans sauter de pages) avant de répondre.\n\n${prompt}`;
  }
  if (req.textDoc) {
    prompt = `=== DOCUMENT : ${req.textDoc.title} ===\n${req.textDoc.text.slice(0, 2_000_000)}\n=== FIN DU DOCUMENT ===\n\n${prompt}`;
  }
  const jsonSchema = req.schema ? (z.toJSONSchema(req.schema, { target: "draft-7", unrepresentable: "any" }) as object) : undefined;
  const r = await runClaudeCode(
    {
      system: req.system,
      prompt,
      jsonSchema,
      model,
      effort: req.effort,
      tools,
      addDirs,
      maxTurns,
    },
    req.ctx,
  );
  trackUsage(req.task, r.model, r.usage, req.ctx, r.costUsd);
  if (!r.ok) {
    const refusal = r.errorKind === "refusal";
    return { output: null, text: r.text, refusal, costUsd: r.costUsd, toolCalls: r.toolCalls, error: r.errorMessage ?? "erreur" };
  }
  let output: T | null = null;
  if (req.schema) {
    const parsed = req.schema.safeParse(r.structured ?? safeJson(r.text));
    if (!parsed.success) return { output: null, text: r.text, refusal: false, costUsd: r.costUsd, toolCalls: r.toolCalls, error: `Sortie non conforme : ${parsed.error.issues[0]?.message ?? "?"}` };
    output = parsed.data;
  }
  return { output, text: r.text, refusal: false, costUsd: r.costUsd, toolCalls: r.toolCalls };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
