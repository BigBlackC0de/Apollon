import Anthropic from "@anthropic-ai/sdk";
import { getDb, getSqlite, schema } from "../db";
import { THEMES, THEME_BY_ID, themesPromptBlock } from "../config/themes";
import { claude, MODEL, APOLLON_PERSONA, trackUsage } from "./client";

/**
 * « Demander à Apollon » : question libre, répondue à partir de la base
 * (scrutins classifiés, positions, programmes, tweets) via des outils.
 * Boucle d'outils manuelle, bornée.
 */

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_scrutins",
    description: "Recherche des scrutins (votes) par mots-clés dans l'intitulé/résumé, optionnellement filtrés par thème, parti (position de son groupe) et chambre. Retourne jusqu'à 20 scrutins avec les positions des groupes.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Mots-clés (français). Chaîne vide pour ne filtrer que par thème." },
        theme: { type: ["string", "null"], description: `Identifiant de thème parmi : ${THEMES.map((t) => t.id).join(", ")}` },
        party_id: { type: ["string", "null"], description: "Identifiant de parti (lfi, pcf, eelv, ps, renaissance, modem, horizons, liot, lr, udr, rn, reconquete, dlf)" },
        chamber: { type: ["string", "null"], enum: ["AN", "SENAT", null] },
      },
      required: ["query", "theme", "party_id", "chamber"],
      additionalProperties: false,
    },
  },
  {
    name: "party_positions",
    description: "Positions d'un parti sur tous les thèmes : déclarée (programme), votée (Assemblée/Sénat), tweets, écart, verdict et synthèse.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { party_id: { type: "string" } },
      required: ["party_id"],
      additionalProperties: false,
    },
  },
  {
    name: "theme_overview",
    description: "Comparaison de tous les partis sur un thème : positions déclarées et votées, verdicts.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { theme: { type: "string" } },
      required: ["theme"],
      additionalProperties: false,
    },
  },
  {
    name: "politician_lookup",
    description: "Cherche un député ou sénateur par nom et retourne son parti, son groupe, ses scores par thème, son taux de dissidence et ses derniers votes importants.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "programme_extracts",
    description: "Extraits analysés du programme d'un parti sur un thème : résumé, mesures, citations.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { party_id: { type: "string" }, theme: { type: "string" } },
      required: ["party_id", "theme"],
      additionalProperties: false,
    },
  },
];

function runTool(name: string, input: Record<string, unknown>): string {
  const sqlite = getSqlite();
  const db = getDb();
  switch (name) {
    case "search_scrutins": {
      const q = String(input.query ?? "").trim();
      const theme = input.theme ? String(input.theme) : null;
      const party = input.party_id ? String(input.party_id) : null;
      const chamber = input.chamber ? String(input.chamber) : null;
      const words = q.split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
      const conds: string[] = ["1=1"];
      const params: unknown[] = [];
      for (const w of words) {
        conds.push("(s.title LIKE ? OR a.summary LIKE ? OR s.objet LIKE ?)");
        params.push(`%${w}%`, `%${w}%`, `%${w}%`);
      }
      if (theme) {
        conds.push("(a.primary_theme = ? OR a.themes LIKE ?)");
        params.push(theme, `%"${theme}"%`);
      }
      if (chamber) {
        conds.push("s.chamber = ?");
        params.push(chamber);
      }
      const rows = sqlite
        .prepare(
          `SELECT s.uid, s.date, s.chamber, s.title, s.sort, s.pour, s.contre, a.summary, a.salience, a.primary_theme AS theme
           FROM scrutins s LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid
           WHERE ${conds.join(" AND ")} ORDER BY COALESCE(a.salience,0) DESC, s.date DESC LIMIT 20`,
        )
        .all(...params) as Record<string, unknown>[];
      const gv = sqlite.prepare(`SELECT group_abbrev AS g, party_id AS p, position FROM group_votes WHERE scrutin_uid = ?`);
      const out = rows.map((r) => {
        const groups = (gv.all(r.uid) as { g: string; p: string | null; position: string | null }[]).filter((x) => !party || x.p === party);
        return { ...r, groupes: groups.map((x) => `${x.g}:${x.position ?? "-"}`).join(" ") };
      });
      return JSON.stringify(out);
    }
    case "party_positions": {
      const rows = db.select().from(schema.partyThemeScores).all().filter((r) => r.partyId === String(input.party_id));
      return JSON.stringify(
        rows.map((r) => ({
          theme: THEME_BY_ID[r.theme]?.label ?? r.theme,
          axe: `${THEME_BY_ID[r.theme]?.poleLeft} ↔ ${THEME_BY_ID[r.theme]?.poleRight}`,
          declaree: r.declaredStance,
          votee_AN: r.votedStance,
          n_votes: r.votedN,
          votee_Senat: r.senatStance,
          tweets: r.postsStance,
          ecart: r.gap,
          verdict: r.verdict,
          synthese: r.narrative,
          preuves: (r.evidence ?? []).slice(0, 6),
        })),
      );
    }
    case "theme_overview": {
      const theme = String(input.theme);
      const rows = sqlite
        .prepare(`SELECT p.name, p.short_name AS short, s.* FROM party_theme_scores s JOIN parties p ON p.id = s.party_id WHERE s.theme = ? ORDER BY p.lr_index`)
        .all(theme) as Record<string, unknown>[];
      return JSON.stringify({ theme: THEME_BY_ID[theme], partis: rows.map((r) => ({ parti: r.name, declaree: r.declared_stance, votee: r.voted_stance, n: r.voted_n, senat: r.senat_stance, tweets: r.posts_stance, ecart: r.gap, verdict: r.verdict, synthese: r.narrative })) });
    }
    case "politician_lookup": {
      const name = String(input.name);
      const pols = sqlite.prepare(`SELECT * FROM politicians WHERE full_name LIKE ? OR last_name LIKE ? LIMIT 5`).all(`%${name}%`, `%${name}%`) as Record<string, unknown>[];
      return JSON.stringify(
        pols.map((p) => ({
          ...p,
          raw_json: undefined,
          scores: sqlite.prepare(`SELECT theme, voted_stance, voted_n, dissent_rate FROM politician_theme_scores WHERE politician_id = ?`).all(p.id),
          derniers_votes: sqlite
            .prepare(
              `SELECT s.date, s.title, v.position, a.summary FROM votes v JOIN scrutins s ON s.uid = v.scrutin_uid LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid WHERE v.politician_id = ? AND COALESCE(a.salience,0) >= 4 ORDER BY s.date DESC LIMIT 15`,
            )
            .all(p.id),
        })),
      );
    }
    case "programme_extracts": {
      const rows = sqlite
        .prepare(`SELECT d.title, d.url, da.stance, da.confidence, da.summary, da.measures, da.quotes FROM document_analyses da JOIN documents d ON d.id = da.document_id WHERE d.party_id = ? AND da.theme = ?`)
        .all(String(input.party_id), String(input.theme));
      return JSON.stringify(rows);
    }
    default:
      return JSON.stringify({ error: `outil inconnu ${name}` });
  }
}

const SYSTEM = `${APOLLON_PERSONA}

Tu réponds aux questions d'un citoyen à partir de la base Apollon (scrutins de l'Assemblée nationale et du Sénat classifiés par thème, positions des partis calculées à partir des votes de groupe, programmes analysés, tweets analysés).
Utilise les outils pour chercher les faits avant de répondre ; ne réponds jamais de mémoire sur des votes précis.
Explique l'échelle quand tu cites une position : chaque thème est un axe de -1 à +1 dont les pôles sont décrits ci-dessous.
Cite les scrutins avec leur date et leur objet. Si la base ne contient pas l'information, dis-le.
Réponds en français, en Markdown, de façon structurée et concise.

THÈMES :
${themesPromptBlock()}`;

export interface AskResult {
  answer: string;
  toolCalls: { name: string; input: unknown }[];
  costUsd: number;
}

export async function ask(question: string, history: Anthropic.MessageParam[] = []): Promise<AskResult> {
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: question }];
  const toolCalls: AskResult["toolCalls"] = [];
  let cost = 0;
  for (let turn = 0; turn < 8; turn++) {
    const res = await claude().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
      output_config: { effort: "medium" },
    });
    cost += trackUsage("ask", MODEL, res.usage);
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "refusal") return { answer: "Apollon n'a pas pu répondre à cette question (refus du modèle).", toolCalls, costUsd: cost };
    if (res.stop_reason !== "tool_use") {
      const answer = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { answer, toolCalls, costUsd: cost };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      toolCalls.push({ name: block.name, input });
      let content: string;
      try {
        content = runTool(block.name, input);
      } catch (e) {
        content = JSON.stringify({ error: (e as Error).message });
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: content.slice(0, 60000) });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "Réponse incomplète (trop d'étapes).", toolCalls, costUsd: cost };
}
