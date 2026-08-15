# AI-Assisted Humanitarian Crisis Mapping, Priority Assessment and Risk Projection System

## Project Overview

This project was developed as part of my MSc Individual Research Project. It is a full-stack web application that collects humanitarian reports from multiple public sources, analyses them with a combination of NLP rules and large language models (LLMs), and presents the results as dashboards, alerts, and an interactive crisis map.

The system is intended to help make sense of high-volume crisis information by estimating reliability, prioritising reports, projecting short-term risk, and highlighting likely humanitarian needs with supporting evidence where available.

## Main Objectives

1. Ingest multi-source humanitarian and crisis-related reports automatically.
2. Process reports asynchronously so analysis does not block the user interface.
3. Extract structured information (crisis type, locations, entities, needs) from free text.
4. Assess source reliability and apply multi-source corroboration where reports overlap.
5. Produce priority levels and short-horizon risk projections with explainable reasoning.
6. Present outputs through operational UI surfaces (dashboard, map, alerts, evaluation).

## System Workflow

```
External data sources
  → Data ingestion (fetch, normalise)
  → Deduplication / filtering
  → Background processing queue
  → LLM / NLP analysis pipeline
  → Entity and humanitarian need extraction
  → Reliability assessment
  → Priority assessment
  → Risk projection
  → Persistence (PostgreSQL via Prisma)
  → Dashboard / crisis map / alerts / evaluation views
```

Reports can also be submitted manually via the ingestion UI. After import, analysis jobs are enqueued and executed by a dedicated worker process.

## Key Features

Implemented features reflected in the current codebase:

- Multi-source automated report collection (public APIs and feeds)
- Manual report import for controlled testing and evaluation
- Deduplication and ingestion status tracking
- Asynchronous background job processing (`npm run worker`)
- LLM-assisted analysis with configurable primary and fallback providers
- Rule-based NLP support for needs, signals, and classification aids
- Extraction of locations, crisis types, entities, and humanitarian needs
- Source credibility and reliability scoring
- Cross-source verification / corroboration when related reports exist
- Priority assessment with indicator breakdown and guardrails
- Short-term risk projection and disaster severity scoring
- Incident correlation / master-incident grouping where evidence supports it
- Historical / similar-case comparison via the learning (CHLE) components
- Explainable reasoning fields stored with assessments
- Interactive Leaflet crisis map (zones, filters, timeline playback)
- Dashboard KPIs, recent incidents, and chart panels
- Alert feed for high-priority or time-sensitive events
- System health, job status, and evaluation views for reviewing outputs

## Technologies Used

Verified from `package.json` and the application source:

| Area | Technology |
|------|------------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL (Supabase in development) via Prisma 6 |
| Maps | Leaflet |
| Icons | lucide-react |
| LLM clients | OpenAI API, Google Gemini (`@google/genai`), OpenRouter (HTTP) |

## Data Sources

Provider wiring lives under `src/lib/ingestionSourceRegistry.ts` and related fetch modules. Configured integrations include:

| Source | Notes |
|--------|--------|
| GDELT DOC API | Default remote feed; no API key |
| ReliefWeb | Optional; requires approved appname |
| NewsAPI | Optional; requires `NEWS_API_KEY` |
| The Guardian Open Platform | Optional; requires API key |
| ACLED | Optional; requires email and API key |
| GDACS | Disaster alerts |
| USGS Earthquakes | Earthquake events |
| NASA EONET | Earth observation events |
| UN News | News RSS/API path used by the fetcher |
| HDX | Humanitarian Data Exchange search (no key for basic use) |
| OCHA / RSS | Public feed-based sources |
| Manual import | Web UI / API |

Availability depends on environment credentials and each provider’s operational status.

## Project Structure

```
src/
  app/                 Next.js routes, pages, and API handlers
  components/          UI (dashboard, map, analysis, evaluation, …)
  services/            Domain logic (ingestion, analysis, priority, risk, …)
  repositories/        Prisma data access
  lib/                 Shared utilities, AI client, constants, map helpers
  types/               Shared TypeScript types
  contexts/            Client React contexts (live updates, sync status)
prisma/
  schema.prisma        Data model
  migrations/          Schema history
scripts/
  worker.ts            Background analysis worker
  *.ts / *.mjs         Operational / maintenance utilities
```

Core analysis orchestration is in services such as `analysisService.ts`, `unifiedReportAnalysisService.ts`, `reportProcessingService.ts`, and `backgroundJobWorkerService.ts`. Dashboard and map data are assembled in `dashboardService.ts` and `mapService.ts`.

## Running the Project

### Prerequisites

- Node.js 20+ recommended
- A PostgreSQL database (for example Supabase)
- API keys for the LLM provider(s) you intend to use
- Optional API keys for NewsAPI, Guardian, ACLED, etc.

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate`.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your database URLs and API keys. Local overrides can go in `.env.local` (loaded by Next.js; keep secrets there if preferred).

### 3. Prepare the database

Apply migrations against `DIRECT_URL` / `DATABASE_URL`:

```bash
npx prisma migrate deploy
# or during local schema work:
npm run db:migrate
```

### 4. Start the web application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Production build:

```bash
npm run build
npm start
```

### 5. Start the background worker

In a **second** terminal (recommended for full analysis):

```bash
npm run worker
```

Without the worker, import and queue operations still run, but LLM analysis will not advance unless an in-process worker mode is explicitly enabled (see environment notes below).

### Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run worker` | Background analysis worker |
| `npm run lint` | ESLint |
| `npm run validate:ui` | Crisis UI consistency checks |
| `npm run jobs:retry-failed` | Retry failed analysis jobs |
| `npm run chle:backfill` | Backfill learning cases |
| `npm run correlation:backfill` | Backfill incident correlation |
| `npm run perf:measure` | Basic endpoint timing measurements |

## Environment Configuration

Required (or strongly recommended):

- `DATABASE_URL` — Prisma pooled connection
- `DIRECT_URL` — migrations / direct connection
- `AI_PROVIDER` — usually `openai`
- `OPENAI_API_KEY` and `OPENAI_MODEL` — when OpenAI is primary
- `GEMINI_API_KEY` / `OPENROUTER_API_KEY` — optional fallbacks
- `NEWS_API_KEY` — if NewsAPI ingestion is used
- `RELIEFWEB_APPNAME` / `RELIEFWEB_APPNAME_APPROVED` — if ReliefWeb is enabled

Optional:

- `GUARDIAN_API_KEY`, `ACLED_EMAIL`, `ACLED_API_KEY`
- `GEONAMES_USERNAME` — location validation fallback
- `DEMO_MODE`, `ALLOW_IN_PROCESS_WORKER`, `WORKER_CONCURRENCY`
- `APP_URL` / `NEXT_PUBLIC_APP_URL` — used when the worker pings the web app
- `CRON_SECRET` — protect scheduled ingestion if used
- `GDELT_API_BASE_URL`, `RELIEFWEB_API_BASE_URL`

See `.env.example` for the full listed names. **Do not commit real secrets.**

## Important Implementation Notes

- The web application and the analysis worker are separate processes. Ingestion can queue reports without `npm run worker`, but LLM analysis will not complete until the worker is running (unless an in-process worker mode is explicitly enabled).
- LLM calls are a core part of the implemented pipeline (report analysis, reasoning, and related services), with rule-based NLP used alongside and as fallback. Provider selection, model names, and related settings are configured through environment variables.
- Incident views include an academic transparency panel that records the analysis method and model information used for a report.
- Local secrets belong in `.env` / `.env.local` only. Those files are gitignored. Copy `.env.example` when setting up a new environment.
- `tsx` is invoked via `npx` for the worker and some maintenance scripts. A network-capable `npx` environment is therefore required to start the worker as currently scripted.

## Evaluation

The application includes an Evaluation area for reviewing analysed reports, filterable listings, and related analytical fields. This supports inspection of system behaviour and assessment outputs during testing and dissertation evaluation work, alongside the system health and job-status views under configuration.

## Academic Context

This software was developed for the MSc Individual Research Project and is the primary implemented artefact for the dissertation. It demonstrates an end-to-end research prototype of multi-source humanitarian intelligence support. It is not intended as a production-deployed operational platform.
