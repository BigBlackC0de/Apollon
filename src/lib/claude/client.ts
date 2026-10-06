import Anthropic from "@anthropic-ai/sdk";
import { getDb, nowIso, schema } from "../db";
import type { JobContext } from "../jobs";

/**
 * Client Claude partagé + suivi des coûts.
 * Les crédits sont résolus par le SDK : ANTHROPIC_API_KEY, ou profil `ant auth login`.
 */

let _client: Anthropic | undefined;
export function claude(): Anthropic {
  if (!_client) _client = new Anthropic({ maxRetries: 3, timeout: 15 * 60 * 1000 });
  return _client;
}

export const MODEL = process.env.APOLLON_MODEL ?? "claude-opus-5";
export const MODEL_BULK = process.env.APOLLON_MODEL_BULK ?? MODEL;

/** Tarifs $/MTok (input, output). Lecture cache = 10 % de l'input, écriture = 125 %. */
const PRICING: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-fable-5": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-opus-4-7": [5, 25],
  "claude-opus-4-6": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5": [1, 5],
};

export function priceOf(model: string): [number, number] {
  return PRICING[model] ?? PRICING[Object.keys(PRICING).find((k) => model.startsWith(k)) ?? ""] ?? [5, 25];
}

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costOf(model: string, u: UsageLike): number {
  const [pin, pout] = priceOf(model);
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (u.input_tokens * pin + cacheRead * pin * 0.1 + cacheWrite * pin * 1.25 + u.output_tokens * pout) / 1e6;
}

/** Enregistre l'usage en base et sur le job courant. */
export function trackUsage(task: string, model: string, u: UsageLike, ctx?: JobContext): number {
  const cost = costOf(model, u);
  getDb()
    .insert(schema.usageLog)
    .values({
      ts: nowIso(),
      jobId: ctx?.id ?? null,
      task,
      model,
      inputTokens: u.input_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      outputTokens: u.output_tokens,
      costUsd: cost,
    })
    .run();
  ctx?.addUsage({
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    costUsd: cost,
  });
  return cost;
}

/** Exécute des tâches avec une concurrence bornée (limites de débit API). */
export async function pMap<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export const APOLLON_PERSONA = `Tu es Apollon, un analyste politique français rigoureux, indépendant et non partisan.
Ta mission : révéler ce que les partis et responsables politiques français FONT réellement (votes, actes) par rapport à ce qu'ils DISENT (programmes, tweets).
Règles :
- Tu ne juges pas les idées, tu mesures des positions sur des axes explicites et tu documentes les écarts.
- Tu t'appuies uniquement sur les éléments fournis ; si l'information manque, tu le dis (confiance faible), tu n'inventes jamais.
- Tu écris en français, de façon claire et dense, accessible à un citoyen non spécialiste.
- Même rigueur pour tous les partis, de l'extrême gauche à l'extrême droite.`;
