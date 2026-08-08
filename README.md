# DataMind AI

> An AI-powered Data Science Operating System. Upload a dataset and receive complete, explainable, business-ready analysis - as if you hired an entire data science team.

DataMind AI is a production-oriented SaaS scaffold. It pairs an enterprise-grade
Next.js frontend with a FastAPI data + AI backend. The AI does not just answer
questions: every insight explains **why** it happened, **what** was found, **what
it recommends**, a **confidence** level, and the **business impact**.

This repository is a **foundation build**: the full architecture is scaffolded and
one complete end-to-end flow works locally with **no paid credentials**:

```
Sign in  ->  Workspace  ->  Project  ->  Upload dataset  ->  Auto profile
        ->  AI-explained EDA  ->  Chat with your data
```

All external services are **swappable via environment variables** (mock AI ->
OpenAI, local storage -> S3/MinIO, SQLite -> Postgres, Credentials -> Google/Clerk).

---

## Architecture

```
datamind-ai/
  apps/web/        Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
                   Framer Motion + React Query + Auth.js (NextAuth)
  services/api/    FastAPI + Pandas/NumPy/scikit-learn + SQLAlchemy + DuckDB
                   Swappable storage + swappable LLM provider + agent pipeline
  packages/        Shared TypeScript types/config
  infra/           Postgres + MinIO init, env examples
  docker-compose.yml
```

- **Frontend owns auth** (Auth.js, JWT session). The signed JWT is sent to the
  backend, which verifies it with a shared `AUTH_SECRET`.
- **Backend is stateless w.r.t. auth**; it resolves user + workspace + role from
  the JWT and enforces workspace isolation + role-based access on every request.
- **AI layer** is an interface (`LLMProvider`) with a deterministic offline
  `MockProvider` (default) and an `OpenAIProvider`. Insights are produced by a
  small agent pipeline: `Profiler -> Analyst -> Explainer -> Recommender`.

---

## Quick start (local, no credentials required)

### Prerequisites
- Node.js >= 18.18 and `pnpm` (`npm i -g pnpm`)
- Python >= 3.11

### Fastest path (from the repo root)
```bash
npm run setup   # one-time: creates the backend venv, installs deps (api + web), copies .env files
npm run seed    # optional: loads the demo workspace/user/project + sample dataset
npm run dev     # starts the backend, waits until it is healthy, then starts the frontend
```
Then open http://localhost:3000 and log in (see step 3). Press Ctrl+C once to
stop both. The manual, per-service steps below are equivalent.

### 1. Backend
```bash
cd services/api
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# macOS/Linux:         source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # defaults use SQLite + local files + mock AI
python -m app.seed            # creates demo workspace, user, project, sample CSV
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### 2. Frontend
```bash
cd apps/web
pnpm install
cp .env.example .env.local    # set AUTH_SECRET to match the backend
pnpm dev
```
App: http://localhost:3000

### 3. Log in
Use the seeded demo account (printed by `python -m app.seed`):
```
Email:    demo@datamind.ai
Password: demo1234
```
Then open the seeded project, view its dataset profile, browse the AI-explained
EDA, and chat with the data. To try the upload flow yourself, create a new
project and upload the bundled sample file at
[`infra/sample-data/sample_sales.csv`](infra/sample-data/sample_sales.csv).

> **Important:** `AUTH_SECRET` must be identical in `apps/web/.env.local` and
> `services/api/.env` for JWT verification to succeed.

---

## Optional: run with Postgres + MinIO (Docker)
```bash
cp .env.example .env
docker compose up -d          # postgres + minio
# add optional pgAdmin:  docker compose --profile tools up -d
```
Then in `services/api/.env` set:
```
DATABASE_URL=postgresql+psycopg://datamind:datamind@localhost:5432/datamind
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY=datamind
S3_SECRET_KEY=datamind-secret
S3_BUCKET=datamind
```

---

## Swapping in real services

| Concern   | Local default        | Production swap (env)                          |
|-----------|----------------------|------------------------------------------------|
| AI        | `MockProvider`       | `AI_PROVIDER=openai` + `OPENAI_API_KEY`        |
| Storage   | Local filesystem     | `STORAGE_BACKEND=s3` + `S3_*`                  |
| Database  | SQLite               | `DATABASE_URL=postgresql+psycopg://...`        |
| Auth      | Email + password     | Google (`AUTH_GOOGLE_ID/SECRET`); Clerk later  |

The interfaces are stable, so swapping does not change application code.

---

## Testing
```bash
# Backend
cd services/api && pytest -q

# Frontend
cd apps/web && pnpm typecheck && pnpm lint
```

---

## Security posture
- Workspace isolation enforced on every query; role-based access control.
- Audit logging middleware records mutating actions.
- Encrypted uploads/at-rest supported via the storage backend (S3 SSE / disk
  encryption); secrets via environment only.
- **Customer data is never used to train AI models.**
- Designed for future on-premise deployment (self-hostable Postgres + MinIO +
  local LLM provider behind the same interface).

## Project status
See the build plan for the incremental roadmap. Modules beyond the core flow
(Reports, Export, Data Cleaning approvals, additional data connectors) are
scaffolded behind clean interfaces with polished empty states.
