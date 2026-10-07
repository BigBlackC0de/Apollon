import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { JobContext } from "../jobs";
import { JobCancelled } from "../jobs";

/**
 * Moteur « Claude Code » : Apollon pilote le binaire officiel `claude` en mode
 * non interactif (`claude -p`). Les appels sont couverts par l'abonnement
 * Claude (Pro/Max) du compte connecté avec `claude auth login`, dans la limite
 * des quotas d'usage de l'abonnement. Aucune facturation à l'acte.
 */

export interface CcRequest {
  system: string;
  prompt: string;
  jsonSchema?: object;
  model: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Outils intégrés autorisés (vide = aucun). */
  tools: string[];
  /** Dossiers supplémentaires accessibles en lecture. */
  addDirs?: string[];
  /** Serveurs MCP (format mcp-config) + motif d'outils autorisés. */
  mcpConfig?: object;
  allowedToolPatterns?: string[];
  maxTurns: number;
  timeoutMs?: number;
}

export interface CcResult {
  ok: boolean;
  text: string;
  structured: unknown;
  costUsd: number;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
  model: string;
  errorKind?: "rate_limit" | "auth" | "refusal" | "other";
  errorMessage?: string;
  toolCalls: { name: string; input: unknown }[];
}

let binCache: string | null = null;

/** Localise l'exécutable `claude` (APOLLON_CLAUDE_BIN, sinon PATH). */
export function claudeBin(): string | null {
  if (binCache) return binCache;
  if (process.env.APOLLON_CLAUDE_BIN && fs.existsSync(process.env.APOLLON_CLAUDE_BIN)) return (binCache = process.env.APOLLON_CLAUDE_BIN);
  const names = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return (binCache = p);
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export function claudeCodeAvailable(): boolean {
  return !!claudeBin();
}

/** Dossier de travail neutre : évite de charger le CLAUDE.md et les hooks du projet. */
export function workDir(): string {
  const d = path.join(process.cwd(), "data", "claude-work");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StreamLine {
  type: string;
  subtype?: string;
  message?: { content?: { type: string; name?: string; input?: unknown; text?: string }[] };
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: Record<string, number>;
  is_error?: boolean;
  api_error_status?: number | null;
  modelUsage?: Record<string, unknown>;
  error?: string;
}

async function runOnce(req: CcRequest): Promise<CcResult> {
  const bin = claudeBin();
  if (!bin) throw new Error("Exécutable `claude` introuvable : installez Claude Code et connectez-vous (`claude auth login`), ou définissez APOLLON_CLAUDE_BIN.");
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--permission-prompts",
    "none",
    "--model",
    req.model,
    "--max-turns",
    String(req.maxTurns),
    "--system-prompt",
    req.system,
    "--tools",
    req.tools.join(","),
  ];
  if (req.effort) args.push("--effort", req.effort);
  if (req.jsonSchema) args.push("--json-schema", JSON.stringify(req.jsonSchema));
  if (req.addDirs?.length) args.push("--add-dir", ...req.addDirs);
  const allowed = [...req.tools, ...(req.allowedToolPatterns ?? [])];
  if (allowed.length) args.push("--allowedTools", ...allowed);
  if (req.mcpConfig) args.push("--mcp-config", JSON.stringify(req.mcpConfig), "--strict-mcp-config");

  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.ANTHROPIC_API_KEY; // on veut l'abonnement, pas une clé API éventuellement présente

  return new Promise<CcResult>((resolve, reject) => {
    const child = spawn(bin, args, { cwd: workDir(), env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude -p : délai dépassé (${Math.round((req.timeoutMs ?? 1_200_000) / 60000)} min)`));
    }, req.timeoutMs ?? 1_200_000);
    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const toolCalls: CcResult["toolCalls"] = [];
      let final: StreamLine | null = null;
      let modelSeen = req.model;
      for (const line of out.split(/\r?\n/)) {
        if (!line.trim().startsWith("{")) continue;
        let j: StreamLine;
        try {
          j = JSON.parse(line) as StreamLine;
        } catch {
          continue;
        }
        if (j.type === "assistant" && j.message?.content) {
          for (const b of j.message.content) if (b.type === "tool_use") toolCalls.push({ name: b.name ?? "?", input: b.input });
        }
        if (j.type === "result") final = j;
      }
      if (!final) {
        resolve({ ok: false, text: "", structured: null, costUsd: 0, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, model: modelSeen, errorKind: "other", errorMessage: (err || out).slice(-800) || "aucun résultat", toolCalls });
        return;
      }
      if (final.modelUsage) {
        const ids = Object.keys(final.modelUsage).filter((k) => !/haiku/.test(k));
        if (ids.length) modelSeen = ids[0];
      }
      const u = final.usage ?? {};
      const usage = {
        input_tokens: u.input_tokens ?? 0,
        output_tokens: u.output_tokens ?? 0,
        cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      };
      const text = final.result ?? "";
      if (final.is_error || final.subtype !== "success") {
        const msg = `${text} ${final.error ?? ""} ${err}`.trim();
        let kind: CcResult["errorKind"] = "other";
        if (final.api_error_status === 429 || /usage limit|rate limit|limit reached|réessayez|resets at|too many requests|overloaded/i.test(msg)) kind = "rate_limit";
        else if (/not logged in|authentication|unauthorized|401|403|log in/i.test(msg)) kind = "auth";
        else if (/refus/i.test(msg)) kind = "refusal";
        resolve({ ok: false, text, structured: null, costUsd: final.total_cost_usd ?? 0, usage, model: modelSeen, errorKind: kind, errorMessage: msg.slice(0, 800), toolCalls });
        return;
      }
      resolve({ ok: true, text, structured: final.structured_output ?? null, costUsd: final.total_cost_usd ?? 0, usage, model: modelSeen, toolCalls });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(req.prompt, "utf8");
  });
}

/**
 * Exécute un appel, en attendant patiemment si le quota de l'abonnement est
 * atteint (fenêtres de 5 h) : nouvelle tentative toutes les 5 minutes, jusqu'à
 * APOLLON_RATE_WAIT_MAX_MIN (défaut 360).
 */
export async function runClaudeCode(req: CcRequest, ctx?: JobContext): Promise<CcResult> {
  const maxWaitMs = Number(process.env.APOLLON_RATE_WAIT_MAX_MIN ?? 360) * 60_000;
  const started = Date.now();
  for (;;) {
    const r = await runOnce(req);
    if (r.ok || r.errorKind !== "rate_limit") return r;
    if (Date.now() - started > maxWaitMs) return r;
    ctx?.log(`Quota de l'abonnement atteint — reprise dans 5 min (${r.errorMessage?.slice(0, 160)})`);
    for (let i = 0; i < 30; i++) {
      await sleep(10_000);
      try {
        ctx?.checkpoint();
      } catch (e) {
        if (e instanceof JobCancelled) throw e;
      }
    }
  }
}
