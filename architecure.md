# Oynix Guardian — Architecture & How It Works

## 1. System architecture

```mermaid
flowchart LR
  Dev([Developer]) -->|opens PR vs main| GH[(GitHub<br/>repo)]
  GH -->|PR-opened trigger| MC

  subgraph Cloud[UiPath Automation Cloud]
    MC[Maestro Case:<br/>Guardian Merge Governance]
    S1[Stage 1<br/>Analyze Impact]
    DEC{Risk level?}
    AC[Action Center<br/>Human Approval]
    S3[Stage 3<br/>Propagate]
    DONE([Close case])
    MC --> S1 --> DEC
    DEC -->|HIGH| AC
    DEC -->|LOW| S3
    AC -->|approve| S3
    AC -->|reject| DONE
    S3 --> DONE
  end

  S1 -->|POST /impact-pr| G
  S3 -->|POST /writeback| G

  subgraph Engine[Oynix Guardian engine]
    G[guardian-service]
    NEO[(Dependency graph<br/>Neo4j)]
    G --> NEO
  end
  G -->|fetch PR's changed files| GH
```

**Flow in words:** a developer opens a PR against `main` → GitHub fires a
trigger → UiPath Maestro Case starts → **Analyze Impact** asks Guardian to score
the PR → if **HIGH**, the case pauses for a human in **Action Center**; if
**LOW**, it auto-approves → on approval, **Propagate** writes back. UiPath is the
orchestration + governance layer; Guardian is the brain.

---

## 2. Sequence — what happens on a PR

```mermaid
sequenceDiagram
  actor Dev as Developer
  participant GH as GitHub
  participant MC as UiPath Maestro Case
  participant AC as Action Center
  participant G as Oynix Guardian

  Dev->>GH: Open PR (changes shared-sdk/auth.ts)
  GH-->>MC: PR-opened trigger { prNumber }
  MC->>G: POST /impact-pr { prNumber }
  G->>GH: fetch PR's changed files
  G->>G: walk dependency graph → risk 82 (HIGH)
  G-->>MC: { riskScore:82, gate:REQUIRE_HUMAN, summary }
  MC->>AC: create approval task ("Risk 82 — approve?")
  Dev->>AC: Approve
  AC-->>MC: outcome = Approve
  MC->>G: POST /writeback { approved:true }
  G-->>MC: docs regenerated, AI agents notified
  MC->>MC: Close case (Propagated)
```

---

## 3. Why the score is 82 — the blast radius

Guardian walks the **real import graph**. Changing `shared-sdk/auth.ts` ripples
outward:

```mermaid
flowchart TD
  AUTH[shared-sdk/auth.ts<br/>CHANGED]:::changed

  AUTH --> CH[checkout-service]:::svc
  AUTH --> PAY[payment-service<br/>PCI]:::svc
  AUTH --> ORD[order-service]:::svc
  AUTH --> AUS[auth-service]:::svc

  AUTH -.stale context.-> DOC[documentation-agent<br/>active]:::agent
  AUTH -.stale context.-> QA[qa-agent<br/>active]:::agent
  AUTH -.stale context.-> IR[incident-response-agent<br/>active]:::agent

  AUTH -.regenerate.-> D1[api.md]:::doc
  AUTH -.regenerate.-> D2[authentication.md]:::doc
  AUTH -.regenerate.-> D3[architecture.md]:::doc
  AUTH -.regenerate.-> D4[runbook.md]:::doc

  classDef changed fill:#cc785c,color:#fff,font-weight:bold;
  classDef svc fill:#2d3b4e,color:#fff;
  classDef agent fill:#3a2d4e,color:#fff;
  classDef doc fill:#2d4e3b,color:#fff;
```

```
risk = (4 services × 10) + (3 active agents × 7) + (4 docs × 2)
       + 8 (payment / PCI) + 5 (shared auth contract)
     = 40 + 21 + 8 + 8 + 5
     = 82  → HIGH (≥ 60) → human approval required
```

A PR touching a leaf (e.g. `notification-service`) has no dependents →
**risk 10 → LOW → auto-propagate.** Same-size change, opposite decision —
because risk is about *what depends on the change*, not the change itself.

---

## 4. Components

| Layer | Piece |
|-------|-------|
| Trigger | GitHub PR-opened event |
| Orchestration | UiPath **Maestro Case** (Analyze → Approve → Propagate) |
| Integration | UiPath **API Workflows** + unified **HTTP connector** |
| Human-in-the-loop | UiPath **Action Center** (Simple Approval app) |
| Brain | **Oynix Guardian** — dependency graph + risk scoring (Node/Express + Neo4j) |
| Platform | UiPath **Automation Cloud** |
| Built with | **Claude Code** via UiPath for Coding Agents |
