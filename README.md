# Oynix Guardian — Enterprise AI Governance for Multi-Agent Development

**UiPath AgentHack 2026 · Track: UiPath Maestro Case**

> When AI agents write your code, *who decides it's safe to propagate?*
> Oynix Guardian turns every merge into a governed UiPath Maestro Case:
> it computes the real blast radius of a change, and pauses for human approval
> before letting the rest of your AI ecosystem act on it.

---

## The problem

Engineering teams increasingly rely on AI agents to write code, generate docs,
review PRs, and answer questions. But every merge raises questions nobody
answers automatically:

- Which services are affected?
- Which documentation is now outdated?
- Which AI agents are operating on stale context?
- Is it safe to propagate this change automatically?

Today these decisions are manual or ignored — so AI agents keep working with
outdated organizational knowledge.

## The solution

Oynix Guardian models the software system as a **living dependency graph**. When
code is merged, **UiPath Maestro** orchestrates a case:

1. **Indexer Agent** rebuilds the knowledge graph from the merged code.
2. **Impact Analysis Agent** computes the blast radius — affected services,
   docs, and active AI agent sessions — and a **risk score**.
3. **Decision Engine** branches on risk:
   - **Low risk** → auto-propagate (update graph, refresh docs, notify agents).
   - **High risk** → **pause** and raise a **UiPath Action Center** approval.
4. **Human approves** → write-back → close case.

Instead of blindly automating, every action becomes **context-aware and
governed**.

```
GitHub merge to main
        │
        ▼
┌──────────────── UiPath Maestro Case ────────────────┐
│  Indexer Agent      → rebuild dependency graph       │
│  Impact Agent       → blast radius + risk score      │
│  Decision Engine    → LOW: auto  /  HIGH: pause      │
│        │ HIGH                                         │
│        ▼                                              │
│  UiPath Action Center  → human approval              │
│        │ approve                                      │
│        ▼                                              │
│  Write-back  → update graph, regen docs, notify agents│
│  Close case                                           │
└──────────────────────────────────────────────────────┘
        │ exception → retry 2× → escalate to human
```

## Why this is a real Maestro Case (not a script)

- **Dynamic branching** on a computed risk score.
- **Human-in-the-loop** approval via Action Center for high-risk changes.
- **Exception handling**: tool failures retry, then escalate — never silently drop.
- **Multi-agent handoff**: Indexer → Impact → Decision → Human → Write-back.

## The risk score is real, not hard-coded

`guardian-service` parses the **actual TypeScript imports** of the demo repo,
the **doc references**, and each AI agent's declared **`depends_on`**, builds a
dependency graph, and computes:

```
risk = (#downstream services × 10) + (#active agents × 7) + (#affected docs × 2)
       + 8 if payment-service in blast radius     (PCI-sensitive)
       + 5 if the shared auth contract is changed
```

Example — changing `shared-sdk/auth.ts`:

| Signal | Value |
|--------|-------|
| Downstream services | checkout, payment, order, auth-service (4) |
| Active AI agents on stale context | documentation, qa, incident-response (3) |
| Docs needing regeneration | 4 |
| **Risk score** | **82 / 100 → HIGH → requires approval** |

Changing `notification-service/index.ts` (a leaf) → **10 / 100 → LOW → auto**.

## Repository layout

```
acme-commerce/          Demo monorepo (the system under governance)
  shared-sdk/auth.ts     ← high-blast-radius auth contract
  gateway, checkout-service, payment-service, inventory-service,
  order-service, notification-service, auth-service
  docs/                  architecture, api, runbook, authentication
  agents/                AI agents w/ declared depends_on (active/idle)
guardian-service/       Impact-analysis engine (Node/Express + Neo4j)
  src/graph.ts           parse repo → dependency graph
  src/impact.ts          blast radius + risk score
  src/server.ts          /index /impact /writeback /graph /sessions
uipath/
  agent-builder/openapi.json   import as Agent Builder tools
  maestro/MAESTRO-CASE-GUIDE.md click-by-click case build
docs/                   demo script, Devpost text, submission checklist
```

## UiPath components used

- **UiPath Maestro Case** — orchestrates merge → index → impact → approval → write-back.
- **UiPath Agent Builder** — Guardian API imported as tools (`analyzeImpact`,
  `writeBack`, `indexRepository`, `listSessions`) via OpenAPI.
- **UiPath Action Center** — human approval task for high-risk changes.
- Runs on **UiPath Automation Cloud** (account `hackathon26_959`).

## Built with coding agents

The Guardian engine and the Maestro Case were built with **Claude Code via
UiPath for Coding Agents**. The `analyzeImpact` tool is a LangChain-compatible
JSON tool, so external-framework agents (CrewAI, AutoGen) can call it identically.

## Run the engine (local + tunnel)

```bash
# 1. Start the impact engine (in-memory graph; Neo4j optional)
cd guardian-service
cp .env.example .env          # set GUARDIAN_TOKEN
npm install
npm start                     # http://localhost:8090

# 2. (optional) graph visual
docker compose up -d          # Neo4j at http://localhost:7474

# 3. Expose to UiPath Automation Cloud
ngrok http 8090               # copy the https URL into openapi.json servers[]
```

Quick check without UiPath:

```bash
cd guardian-service
npm run impact -- shared-sdk/auth.ts            # → HIGH, risk 82
npm run impact -- notification-service/index.ts # → LOW, risk 10
```

Then follow [`uipath/maestro/MAESTRO-CASE-GUIDE.md`](uipath/maestro/MAESTRO-CASE-GUIDE.md)
to wire the Maestro Case.

## Privacy

This demo runs entirely on **isolated test data** (the `acme-commerce` repo and a
local Neo4j). It does not connect to any production database.

## License

[MIT](LICENSE)
