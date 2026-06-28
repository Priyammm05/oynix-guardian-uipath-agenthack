# Building the Oynix Guardian Maestro Case (step-by-step)

This is the click-by-click guide to assemble the orchestration on **UiPath
Automation Cloud**. It assumes the Guardian service is running locally and
exposed via ngrok (see root README → "Run the engine").

---

## 0. Prerequisites (5 min)

1. Guardian service running locally: `cd guardian-service && npm start`
2. Tunnel it: `ngrok http 8090` → copy the `https://xxxx.ngrok-free.app` URL.
3. Health check: open `https://xxxx.ngrok-free.app/health` → should return JSON.
4. Edit `uipath/agent-builder/openapi.json` → set the `servers[0].url` to your
   ngrok URL.

---

## 1. Register Guardian as an Agent Builder tool (10 min)

1. Automation Cloud → **Agent Builder** → **Tools** → **New tool** →
   **Import from OpenAPI**.
2. Upload `uipath/agent-builder/openapi.json`.
3. Add the API key credential: header `x-guardian-token` = your
   `GUARDIAN_TOKEN` value (from `guardian-service/.env`).
4. You now have 4 callable tools: `indexRepository`, `analyzeImpact`,
   `writeBack`, `listSessions`.

---

## 2. Create the Maestro Case (20–30 min)

Maestro → **New** → **Case**. Name it **"Oynix Guardian — Merge Governance"**.

### Trigger
- **Event**: GitHub `push`/`merge` to `main` on the `acme-commerce` repo.
  (Use a GitHub App/webhook, or for a reliable demo, a **manual start** with a
  `changedFiles` input — see §4.)
- Case input variable: `changedFiles` (array of strings).

### Stage 1 — Indexer Agent
- **Task**: call tool `indexRepository`.
- Rebuilds the knowledge graph from the merged code. Store `nodes`/`edges`.

### Stage 2 — Impact Analysis Agent
- **Task**: call tool `analyzeImpact` with `{ changedFiles }`.
- Save the response: `riskScore`, `riskLevel`, `affectedServices`,
  `activeAgents`, `decision.gate`, `decision.summary`.

### Stage 3 — Decision Engine (gateway/branch)
Branch on `decision.gate`:

| Gate | Path |
|------|------|
| `AUTO_APPROVE` (low risk) | go straight to Stage 5 (write-back) |
| `REQUIRE_HUMAN` (high risk) | go to Stage 4 (approval) |

### Stage 4 — Human Approval (the money shot)
- **Action Center task**: type **Approval**.
- Title: `Approve change propagation?`
- Body: bind to `decision.summary` (e.g. *"shared-sdk/auth.ts affects 4
  services and invalidates context for 3 active AI agents. Risk 82/100.
  Approve propagation?"*).
- Also surface `affectedServices`, `activeAgents`, `riskScore`.
- Outcomes: **Approve** → Stage 5. **Reject** → Stage 6 (close as rejected).

### Stage 5 — Write-back
- **Task**: call tool `writeBack` with `{ changedFiles, approved: true }`.
- Graph updated, docs regenerated, AI agents notified.

### Stage 6 — Close Case
- Set case outcome: `Propagated` / `Rejected`.
- (Optional) call `listSessions` to log which agents were refreshed.

### Exception path
- On any tool error (e.g. Guardian unreachable): **retry 2×**, then escalate the
  case to a human with the error — do **not** silently drop. This is what makes
  it a real Maestro Case, not a script.

---

## 3. External-framework / coding-agent bonus

- In the README and demo video, state that the Guardian engine and this case
  were **built with Claude Code via "UiPath for Coding Agents."** (Bonus points.)
- The `analyzeImpact` tool is a LangChain-compatible JSON tool — Agent Builder,
  CrewAI, or AutoGen agents can call it identically.

---

## 4. Reliable demo trigger (recommended)

GitHub webhooks through ngrok can be flaky on stage. For a bulletproof live
demo, start the case **manually** with the `changedFiles` input:

- High-risk run: `changedFiles = ["shared-sdk/auth.ts"]` → risk 82, pauses for
  approval.
- Low-risk run: `changedFiles = ["notification-service/index.ts"]` → risk 10,
  auto-approves and closes.

Show BOTH in the video to prove the branching is real.
