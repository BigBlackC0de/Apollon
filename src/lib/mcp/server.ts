/**
 * Serveur MCP (stdio) exposant les outils d'interrogation de la base Apollon.
 * Lancé par Claude Code lors d'une question au chat (moteur claude-code).
 *   node node_modules/tsx/dist/cli.mjs src/lib/mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runTool } from "../claude/tools";

if (process.env.APOLLON_ROOT) process.chdir(process.env.APOLLON_ROOT);

const server = new McpServer({ name: "apollon", version: "0.1.0" });

const call = (name: string) => async (input: Record<string, unknown>) => {
  try {
    return { content: [{ type: "text" as const, text: runTool(name, input) }] };
  } catch (e) {
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }], isError: true };
  }
};

server.registerTool("database_status", { description: "État de la base Apollon : volumes importés et classifiés (total et par thème), programmes, tweets, synthèses. À appeler pour toute question de volume ou de couverture.", inputSchema: {} }, call("database_status"));
server.registerTool(
  "search_scrutins",
  {
    description: "Recherche des scrutins (votes) par mots-clés, thème, parti et chambre. Retourne jusqu'à 20 scrutins avec les positions des groupes.",
    inputSchema: {
      query: z.string().describe("Mots-clés en français ; chaîne vide pour ne filtrer que par thème"),
      theme: z.string().nullable().describe("Identifiant de thème (economie-travail, fiscalite-budget, retraites, sante-social, immigration, securite-justice, societe-laicite, europe-international, ecologie-energie, institutions-democratie, education-culture)"),
      party_id: z.string().nullable().describe("lfi, pcf, eelv, ps, renaissance, modem, horizons, lr, udr, rn, reconquete"),
      chamber: z.enum(["AN", "SENAT"]).nullable(),
    },
  },
  call("search_scrutins"),
);
server.registerTool("party_positions", { description: "Positions d'un parti sur tous les thèmes : déclarée, votée, tweets, écart, verdict, synthèse.", inputSchema: { party_id: z.string() } }, call("party_positions"));
server.registerTool("theme_overview", { description: "Comparaison de tous les partis sur un thème.", inputSchema: { theme: z.string() } }, call("theme_overview"));
server.registerTool("politician_lookup", { description: "Fiche d'un député ou sénateur par nom : parti, groupe, scores, dissidence, votes majeurs.", inputSchema: { name: z.string() } }, call("politician_lookup"));
server.registerTool("programme_extracts", { description: "Extraits analysés du programme d'un parti sur un thème.", inputSchema: { party_id: z.string(), theme: z.string() } }, call("programme_extracts"));

const transport = new StdioServerTransport();
server.connect(transport).catch((e) => {
  console.error(e);
  process.exit(1);
});
