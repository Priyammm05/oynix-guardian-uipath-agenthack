// impact.ts
// Given a set of changed files, compute the blast radius across the graph and
// a deterministic risk score. Every number traces back to real graph edges.

import type { Graph, GEdge } from "./graph.js";

export interface ImpactResult {
  changedFiles: string[];
  affectedServices: string[];
  affectedDocs: string[];
  affectedAgents: { id: string; label: string; status: string }[];
  activeAgents: string[];
  riskScore: number;
  riskLevel: "LOW" | "HIGH";
  reasons: string[];
}

const HIGH_RISK_THRESHOLD = 60;

/** Reverse-reachable file ids via IMPORTS (who depends on `changed`). */
function reverseImportClosure(graph: Graph, changed: string[]): Set<string> {
  const importers = new Map<string, string[]>(); // to -> [from...]
  for (const e of graph.edges) {
    if (e.type === "IMPORTS") {
      const arr = importers.get(e.to) ?? [];
      arr.push(e.from);
      importers.set(e.to, arr);
    }
  }
  const seen = new Set<string>(changed);
  const stack = [...changed];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const dep of importers.get(cur) ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep);
        stack.push(dep);
      }
    }
  }
  return seen;
}

export function analyzeImpact(graph: Graph, changedFiles: string[]): ImpactResult {
  const changed = changedFiles.filter((f) => graph.nodes.has(f));
  const reasons: string[] = [];

  // 1) affected files = changed + everyone who transitively imports them
  const affectedFiles = reverseImportClosure(graph, changed);

  // 2) affected services = services owning any affected file.
  //    `shared-sdk` is a library, not a deployable service, so it never counts
  //    toward the service blast radius (it is the thing being changed).
  const services = new Set<string>();
  for (const e of graph.edges) {
    if (e.type === "OWNS" && affectedFiles.has(e.to) && e.from !== "shared-sdk") {
      services.add(e.from);
    }
  }

  // 3) affected docs = docs that REFERENCE any affected file
  const docs = new Set<string>();
  for (const e of graph.edges) {
    if (e.type === "REFERENCES" && affectedFiles.has(e.to)) docs.add(e.from);
  }

  // 4) affected agents = agents that DEPEND_ON any affected file/doc/service
  const blastTargets = new Set<string>([...affectedFiles, ...docs, ...services]);
  const affectedAgents: ImpactResult["affectedAgents"] = [];
  const agentSeen = new Set<string>();
  for (const e of graph.edges) {
    if (e.type !== "DEPENDS_ON") continue;
    if (blastTargets.has(e.to) && !agentSeen.has(e.from)) {
      const n = graph.nodes.get(e.from);
      if (n && n.kind === "agent") {
        agentSeen.add(e.from);
        affectedAgents.push({ id: n.id, label: n.label, status: n.status ?? "active" });
      }
    }
  }
  const activeAgents = affectedAgents.filter((a) => a.status === "active");

  // ---- Risk score (deterministic, explainable) ----
  const svcCount = services.size;
  const activeCount = activeAgents.length;
  const docCount = docs.size;
  const touchesPayment = services.has("payment-service");
  const touchesSharedAuth = changed.some((f) => f.startsWith("shared-sdk/auth"));

  let score = svcCount * 10 + activeCount * 7 + docCount * 2;
  if (touchesPayment) score += 8; // PCI-sensitive path
  if (touchesSharedAuth) score += 5; // org-wide auth contract
  const riskScore = Math.min(100, Math.round(score));
  const riskLevel = riskScore >= HIGH_RISK_THRESHOLD ? "HIGH" : "LOW";

  // ---- Human-readable reasons ----
  if (svcCount) reasons.push(`${svcCount} service(s) depend on the change: ${[...services].join(", ")}`);
  if (activeCount) reasons.push(`${activeCount} active AI agent(s) rely on now-stale context: ${activeAgents.map((a) => a.label).join(", ")}`);
  if (docCount) reasons.push(`${docCount} document(s) need regeneration: ${[...docs].join(", ")}`);
  if (touchesPayment) reasons.push("Payment service is in the blast radius (PCI-sensitive).");
  if (touchesSharedAuth) reasons.push("Change modifies the shared authentication contract used org-wide.");
  if (!reasons.length) reasons.push("No downstream dependents found; change is isolated.");

  return {
    changedFiles: changed,
    affectedServices: [...services].sort(),
    affectedDocs: [...docs].sort(),
    affectedAgents,
    activeAgents: activeAgents.map((a) => a.label),
    riskScore,
    riskLevel,
    reasons,
  };
}

export { HIGH_RISK_THRESHOLD };
