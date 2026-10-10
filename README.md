<p align="center">
  <img src="public/logo.svg" alt="Logo Cohérence-Politique" height="120">
</p>

# Cohérence-Politique

**Ce que les partis disent. Ce qu'ils votent.**

Cohérence-Politique est un outil citoyen qui confronte, pour chaque parti politique français majeur (de LFI à Reconquête) :

- ses **programmes officiels** (trouvés sur le web et lus intégralement par Claude),
- ses **votes au Parlement** (8 500+ scrutins de l'Assemblée nationale, XVIIe législature, votes nominatifs ; scrutins du Sénat),
- ses **prises de parole sur X** (tweets des partis et de leurs figures, affirmations vérifiées contre les votes réels).

Tout est digéré par Claude (Anthropic) en positions mesurables sur 11 thèmes, puis comparé : écart « dire / faire », boussole programme vs votes, verdicts argumentés avec les scrutins en preuve, et un chat qui répond en citant les votes.

> Les positions sont des estimations documentées, pas des vérités. Chaque score renvoie aux scrutins qui le fondent.

## Démarrage

```bash
npm install
cp .env.example .env
npm run dev               # http://localhost:3000
```

### Arrêter le serveur

Dans le terminal où il tourne : `Ctrl + C`. S'il tourne en arrière-plan ou dans un autre terminal, repérer puis arrêter le processus qui écoute le port 3000.

```powershell
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess   # repérer le PID
Stop-Process -Id <PID> -Force

# ou en une ligne
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

```bash
# macOS / Linux
lsof -ti :3000 | xargs kill
```

Ne pas arrêter le serveur pendant un job en cours (panneau « Données & jobs ») : les jobs reprennent là où ils se sont arrêtés, mais mieux vaut attendre la fin du passage. À arrêter aussi avant de renommer ou déplacer `data/*.db`.

### Deux moteurs Claude au choix

| Moteur | Comment | Facturation |
|---|---|---|
| **Claude Code** (défaut si aucune clé API) | Cohérence-Politique pilote le binaire officiel `claude -p`, connecté avec `claude auth login` | Couvert par votre abonnement Claude (Pro/Max), dans ses quotas d'usage. Usage personnel uniquement : Anthropic n'autorise pas à offrir un abonnement à des tiers. |
| **API Anthropic** | `ANTHROPIC_API_KEY` dans `.env` | À l'usage (voir coûts ci-dessous) |

Avec Claude Code, les montants affichés dans l'interface sont des **équivalents** (rien n'est facturé). Quand le quota de l'abonnement est atteint, les jobs attendent et reprennent seuls.

Puis, dans **Données & jobs** (ou en CLI, voir plus bas) :

| Étape | Job | Coût indicatif en API (Opus 5) — inclus dans l'abonnement avec Claude Code |
|---|---|---|
| 1 | Importer l'Assemblée nationale | gratuit (open data officiel) |
| 2 | Importer le Sénat | gratuit (NosParlementaires) |
| 3 | Classifier les scrutins | ≈ 15–40 $ pour toute la législature, puis incrémental |
| 4 | Trouver les programmes → Analyser les programmes | ≈ 1–3 $ + 1–2 $ / document |
| 5 | Rafraîchir X → Analyser les tweets → Vérifier les affirmations | X facture ≈ 0,005 $/tweet lu ; Claude ≈ 0,03 $/tweet |
| 6 | Synthèses dire / faire | ≈ 0,15 $ × ~150 cellules |

« Tout rafraîchir » enchaîne le tout de façon incrémentale : à relancer quotidiennement (cron) pour suivre en temps réel.

```bash
npm run job -- ingest-an
npm run job -- classify-scrutins --limit 200     # test à petite échelle
npm run job -- refresh-all --budget 40           # plafond de dépense Claude par job
```

Levier de coût : `COHERENCE_MODEL_BULK=claude-sonnet-5` pour les tâches de masse (classification, tweets).

## Architecture

```
src/lib/config/        thèmes (axes −1/+1) et référentiel des partis (groupes AN/Sénat, comptes X)
src/lib/ingest/        AN (data.assemblee-nationale.fr), Sénat (nosparlementaires.fr)
src/lib/llm/           couche moteur : API Anthropic ou Claude Code (`claude -p`)
src/lib/claude/        classification des scrutins, programmes (web search + PDF), tweets, synthèses, chat
src/lib/mcp/           serveur MCP exposant la base au chat via Claude Code
src/lib/analysis/      calcul des positions votées / déclarées / écarts
src/lib/db/            schéma Drizzle + SQLite (data/coherence.db, migrations auto)
src/app/               Next.js 16 (App Router) : boussole, partis, thèmes, scrutins, parlementaires, comparer, demander, données & jobs
scripts/cli.ts         mêmes jobs en ligne de commande
```

### Méthode

- **Position votée** d'un parti sur un thème = moyenne, pondérée par l'importance du scrutin, de (position majoritaire du groupe) × (sens d'un vote POUR sur l'axe du thème), sur les scrutins de fond (votes de procédure exclus).
- **Position déclarée** = analyse structurée des programmes, pondérée par la confiance.
- **Écart** = |déclaré − voté|. Les synthèses de Claude tiennent compte de la logique majorité/opposition et citent les scrutins.
- **Boussole** : x = thèmes économiques, y = thèmes sociétaux (immigration, sécurité, mœurs, Europe).

### Sources

- Assemblée nationale : [data.assemblee-nationale.fr](https://data.assemblee-nationale.fr) (licence ouverte) — mis à jour quotidiennement.
- Sénat : [NosParlementaires](https://nosparlementaires.fr/donnees-ouvertes) (Licence Ouverte 2.0), normalisation de data.senat.fr.
- Programmes : sites officiels des partis, découverts par recherche web.
- X : API v2 (OAuth 2.0 compte utilisateur ou bearer token), ou import manuel.

## Limites connues

- Les députés remplacés en cours de législature ne sont pas nommés (seuls les élus en exercice sont importés) ; leurs votes comptent dans les agrégats de groupe.
- Les groupes des sénateurs élus en septembre 2026 ne sont pas encore publiés par la source.
- Seuls les partis à poids réel sont suivis ; le groupe LIOT (hétérogène), Debout la France et les non-inscrits n'ont pas de fiche parti (leurs votes de groupe restent visibles sur chaque scrutin).
- L'orientation des axes est une convention de lecture, explicitée sur chaque page thème.
