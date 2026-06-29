# Oynix Guardian — Enterprise AI Governance for Multi-Agent Development

**UiPath AgentHack 2026 · Track: UiPath Maestro Case**

> When AI agents write your code, *who decides a change is safe to spread?*
> Open a pull request → **Oynix Guardian** measures its real blast radius →
> if it's risky, a human must approve in **UiPath** *before it can merge*.

## What it does

**Oynix Guardian is a governance layer for AI-driven software changes.** When a
developer (or an AI agent) opens a pull request, a **UiPath Maestro Case** asks
Guardian to analyze it: Guardian reads the code's real dependency graph and
computes a **risk score** from how many services, documents, and active AI
agents depend on the changed file. Low-risk changes propagate automatically;
**high-risk changes pause for a human to approve in UiPath Action Center before
the PR can merge to `main`.** It solves a growing problem — AI agents change code
faster than anyone can check what each change breaks across the organization, so
risky changes get merged and propagated before a human ever reviews their impact.

---

## The problem

Engineering teams increasingly rely on AI agents to write code, generate docs,
review PRs, and answer questions. But every change quietly raises questions
nobody answers automatically:

- Which services does this change break?
- Which documentation is now outdated?
- Which AI agents are now operating on stale context?
- Is it safe to propagate this automatically?

Today these decisions are manual or ignored — so AI agents keep acting on
outdated organizational knowledge.

## The solution

Oynix Guardian models the software system as a **living dependency graph**. The
moment a pull request is opened against `main`, **UiPath Maestro** runs a case:

1. **Analyze Impact** — Guardian fetches the PR's changed files from GitHub,
   walks the dependency graph, and computes a **risk score** (affected
   services, docs, and active AI agent sessions).
2. **Human Approval** — if the risk is HIGH, the case **pauses** and raises a
   **UiPath Action Center** approval task ("Risk 82/100 — approve?").
3. **Propagate** — once approved, Guardian writes back: updates the graph,
   regenerates affected docs, notifies the AI agents. Then the case closes.

Low-risk changes auto-approve; only risky ones interrupt a human. Governance,
not blind automation — and it gates the change *before* it merges.

```
Open PR against main  (changes shared-sdk/auth.ts)
        │  GitHub trigger
        ▼
┌──────────────── UiPath Maestro Case ────────────────┐
│  Analyze Impact   → Guardian /impact-pr → risk 82    │
│  Decision         → HIGH → pause / LOW → auto         │
│  Human Approval   → UiPath Action Center (approve?)   │
│        │ approve                                      │
│  Propagate        → Guardian /writeback               │
│  Close case                                           │
└──────────────────────────────────────────────────────┘
```

## The risk score is real, not hard-coded

`guardian-service` parses the **actual TypeScript imports** of the changed
repo, the **doc references**, and each AI agent's declared **`depends_on`**,
builds a dependency graph, and computes:

```
risk = (#downstream services × 10) + (#active agents × 7) + (#affected docs × 2)
       + 8 if payment-service in blast radius   (PCI-sensitive)
       + 5 if the shared auth contract changes
```

Example — a PR changing `shared-sdk/auth.ts`:

| Signal | Value |
|--------|-------|
| Downstream services | checkout, payment, order, auth-service (4) |
| Active AI agents on stale context | documentation, qa, incident-response (3) |
| Docs needing regeneration | 4 |
| **Risk score** | **82 / 100 → HIGH → requires approval** |

A PR changing a leaf service → **10 / 100 → LOW → auto-propagates**. The numbers
come from the graph, not a constant. Change the PR, the score changes.

## UiPath components used

- **UiPath Maestro Case** — 3 stages: *Analyze Impact → Human Approval →
  Propagate*, with sequential tasks and a human-in-the-loop gate.
- **UiPath API Workflows** — `GuardianImpact` (calls `/impact-pr`) and
  `GuardianWriteback` (calls `/writeback`).
- **Unified HTTP Connector** (Integration Service) — the connection Guardian is
  called through.
- **UiPath Action Center** — the *Simple Approval* app shows the risk and
  captures Approve/Reject.
- **UiPath Studio Web (Solutions)** — the project that holds the case, the
  workflows, and the app.
- Runs on **UiPath Automation Cloud**.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for diagrams (system, sequence, and the
blast-radius graph).

## Agent type

**Low-code.** The orchestration and agent logic are built entirely with UiPath
**low-code** components — a Maestro Case, low-code API Workflows, and an Action
Center app, all authored visually in UiPath Studio Web. They call an external
custom-coded analysis service (**Oynix Guardian**, Node/TypeScript) over HTTP.
So: **a low-code UiPath solution integrated with an external coded service** (no
UiPath Coded Agents are used).

> The solution was *authored* with **Claude Code** via "UiPath for Coding
> Agents" — that's the development tool, separate from the solution's low-code
> agent type.

## Guardian API (`guardian-service`)

| Endpoint | Purpose |
|----------|---------|
| `POST /impact-pr` | `{prNumber}` → fetch the PR's files from GitHub → risk + gate |
| `POST /impact` | `{changedFiles[]}` → risk + gate (explicit file list) |
| `POST /writeback` | `{changedFiles[], approved}` → propagate + refresh |
| `GET /graph` | dependency graph (for visualization) |
| `GET /health` | liveness |

## Repository layout

```
acme-commerce/          Demo monorepo (the system under governance)
  shared-sdk/auth.ts     ← high-blast-radius auth contract
  gateway, checkout-service, payment-service, inventory-service,
  order-service, notification-service, auth-service
  docs/                  architecture, api, runbook, authentication
  agents/                AI agents w/ declared depends_on (active/idle)
guardian-service/       Impact engine (Node/Express + Neo4j)
  src/graph.ts           parse repo → dependency graph
  src/impact.ts          blast radius + risk score
  src/github.ts          fetch a PR's changed files
  src/server.ts          /impact /impact-pr /writeback /graph
uipath/                 OpenAPI + Maestro Case build guide
```

## Built with coding agents

Guardian's engine and the Maestro Case were built with **Claude Code via UiPath
for Coding Agents**.

## Setup & run — step by step (for judges)

### Prerequisites
- **Node.js 20.12+** (uses the built-in `.env` loader)
- **ngrok** (free) — to expose the local engine to UiPath Automation Cloud
- A **GitHub token** (repo scope) — so write-back can merge the PR
- A **UiPath Automation Cloud** tenant with **Maestro**, **Action Center**, and
  **Integration Service** enabled *(Action Center needs a license assigned — see
  note at the end)*
- *(optional)* Docker — only for the Neo4j graph visual

### Part A — Run the Guardian engine (≈3 min)
```bash
cd guardian-service
cp .env.example .env
# edit .env and set:
#   GUARDIAN_TOKEN=demo-guardian-secret      (shared secret UiPath sends)
#   GITHUB_TOKEN=<your GitHub PAT, repo scope> (lets write-back merge the PR)
#   GUARDIAN_PR_REPO=<owner>/<repo>           (the repo PRs are opened against)
npm install
npm start                                     # → http://localhost:8090
```
Sanity-check the engine without UiPath:
```bash
npm run impact -- shared-sdk/auth.ts            # → HIGH, risk 82
npm run impact -- notification-service/index.ts # → LOW, risk 10
```

### Part B — Expose it to UiPath (≈1 min)
```bash
ngrok http 8090        # copy the https://....ngrok-free.app URL
```
*(Tip: reserve a free static domain so the URL doesn't change on restart:
`ngrok http --domain=<your-domain> 8090`.)*

### Part C — Wire UiPath (≈30 min, one time)
Full click-by-click is in
[`uipath/maestro/MAESTRO-CASE-GUIDE.md`](uipath/maestro/MAESTRO-CASE-GUIDE.md).
In short:
1. **Integration Service → HTTP connector → new connection** ("Guardian"): set
   Base URL = your ngrok URL, Auth = API Key, header `x-guardian-token` =
   `demo-guardian-secret`.
2. **Studio Web → new Solution** with two **API Workflows**, each an HTTP Request:
   - `GuardianImpact` → POST `<ngrok>/impact-pr`, body `{"prNumber": <PR#>}`
   - `GuardianWriteback` → POST `<ngrok>/writeback`, body `{"prNumber": <PR#>, "approved": true}`
3. **Maestro Case** with 3 stages: **Analyze Impact** (runs GuardianImpact) →
   **Human Approval** (Action Center *Simple Approval* app, assigned to you) →
   **Propagate** (runs GuardianWriteback).
4. **Publish.**

### Part D — Run the demo end to end
1. Open a PR against `main` that changes `shared-sdk/auth.ts` (note its number;
   put that number in both workflow bodies, then Publish).
2. Run the Maestro Case (**Debug on cloud**).
3. It computes **risk 82** → pauses at **Human Approval**.
4. Open **Actions**, review the risk, click **Approve**.
5. Write-back **merges the PR to main** and stamps the affected docs.

### Note on Action Center
Maestro's human approval requires **Action Center**. If your tenant doesn't have
it: Admin → tenant → **Services → Add services → Actions**, then Admin →
**Licenses** → assign a license that includes Action Center (e.g. **Pro**) to
your user.

## Privacy

This demo runs on **isolated test data** (the `acme-commerce` repo + a local
Neo4j). It does not connect to any production database.

## License

[MIT](LICENSE)
