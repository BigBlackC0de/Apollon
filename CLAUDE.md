# Apollon — notes pour les agents

- Langue du produit et des prompts : **français**. Ton non partisan, même rigueur pour tous les partis.
- Stack : Next.js 16 (App Router, `cacheComponents` désactivé, pages `force-dynamic`), TypeScript strict, Tailwind v4, Drizzle + better-sqlite3 (`data/apollon.db`), `@anthropic-ai/sdk` avec sorties structurées Zod (`messages.parse` + `zodOutputFormat`).
- Modèles : `APOLLON_MODEL` (défaut `claude-opus-5`) et `APOLLON_MODEL_BULK`. Ne jamais mettre `budget_tokens` ; utiliser `output_config.effort`.
- Tout appel au modèle passe par `llm()` (`src/lib/llm`), qui choisit le moteur (API ou Claude Code via `claude -p`) et appelle `trackUsage()` (coût en base + budget du job). Tout traitement long est un job (`src/lib/pipeline.ts`) idempotent et incrémental.
- Schéma DB : modifier `src/lib/db/schema.ts` puis `npm run db:generate` (migrations auto-appliquées à l'ouverture).
- Vérifications : `npm run typecheck`, puis `npm run dev` et curl des pages. Les imports AN/Sénat sont gratuits et testables sans clé Claude.
- Taxonomie des thèmes dans `src/lib/config/themes.ts` : changer un axe invalide les analyses existantes (re-classifier avec `--force` côté synthèses, vider `scrutin_analyses` côté scrutins).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
