# Oynix Guardian — Enterprise AI Governance for Multi-Agent Development

**UiPath AgentHack 2026 · Track: UiPath Maestro Case**

> When AI agents write your code, *who decides a change is safe to spread?*
> Open a pull request → **Oynix Guardian** measures its real blast radius →
> if it's risky, a human must approve in **UiPath** *before it can merge*.

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

## Run it (local + tunnel)

```bash
# 1. Start the impact engine
cd guardian-service
cp .env.example .env          # set GUARDIAN_TOKEN
npm install
npm start                     # http://localhost:8090

# 2. (optional) graph visual
docker compose up -d          # Neo4j at http://localhost:7474

# 3. Expose to UiPath Automation Cloud
ngrok http 8090               # use the https URL in the UiPath HTTP connection
```

Quick check:

```bash
npm run impact -- shared-sdk/auth.ts            # → HIGH, risk 82
npm run impact -- notification-service/index.ts # → LOW, risk 10
```

Then follow [`uipath/maestro/MAESTRO-CASE-GUIDE.md`](uipath/maestro/MAESTRO-CASE-GUIDE.md).

## Privacy

This demo runs on **isolated test data** (the `acme-commerce` repo + a local
Neo4j). It does not connect to any production database.

## License

[MIT](LICENSE)
