// server.ts
// Oynix Guardian API — the engine UiPath Maestro orchestrates.
//
// Endpoints (all JSON):
//   GET  /health              liveness
//   POST /index               (re)build the dependency graph from acme-commerce
//   POST /impact              { changedFiles[] } -> blast radius + risk + gate
//   POST /writeback           { changedFiles[], approved } -> propagate + refresh
//   GET  /graph               viz data (nodes/links)
//   GET  /sessions            active AI agent sessions
//
// This runs entirely on isolated demo data (the acme-commerce repo + a local
// Neo4j). It never touches any production database.

import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildGraph, type Graph } from "./graph.js";
import { analyzeImpact, HIGH_RISK_THRESHOLD } from "./impact.js";
import { initNeo4j, syncGraph, markStale, isNeo4jEnabled } from "./neo4j.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACME_REPO_PATH = process.env.ACME_REPO_PATH
  ? resolve(process.env.ACME_REPO_PATH)
  : resolve(__dirname, "../../acme-commerce");
const PORT = Number(process.env.PORT ?? 8090);

let graph: Graph = buildGraph(ACME_REPO_PATH);
// Track which nodes are currently "stale" (changed but not yet written back).
const staleNodes = new Set<string>();

const app = express();
app.use(express.json());

// Simple shared-secret guard so a public ngrok URL isn't wide open.
app.use((req, res, next) => {
  const required = process.env.GUARDIAN_TOKEN;
  if (!required || req.path === "/health") return next();
  const got = req.header("x-guardian-token");
  if (got !== required) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "oynix-guardian",
    neo4j: isNeo4jEnabled(),
    repo: ACME_REPO_PATH,
    nodes: graph.nodes.size,
    edges: graph.edges.length,
  });
});

// Indexer Agent: parse the repo into the knowledge graph.
app.post("/index", async (_req, res) => {
  graph = buildGraph(ACME_REPO_PATH);
  staleNodes.clear();
  await syncGraph(graph);
  res.json({
    indexed: true,
    nodes: graph.nodes.size,
    edges: graph.edges.length,
    neo4j: isNeo4jEnabled(),
  });
});

// Impact Analysis Agent + Decision Engine.
app.post("/impact", (req, res) => {
  const changedFiles: string[] = req.body?.changedFiles ?? [];
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return res.status(400).json({ error: "changedFiles[] required" });
  }
  const result = analyzeImpact(graph, changedFiles);

  // mark blast radius stale (for the viz + writeback)
  staleNodes.clear();
  result.affectedServices.forEach((s) => staleNodes.add(s));
  result.affectedDocs.forEach((d) => staleNodes.add(d));
  result.changedFiles.forEach((f) => staleNodes.add(f));
  markStale([...staleNodes], true);

  const gate = result.riskLevel === "HIGH" ? "REQUIRE_HUMAN" : "AUTO_APPROVE";
  const summary =
    result.riskLevel === "HIGH"
      ? `${result.changedFiles.join(", ")} affects ${result.affectedServices.length} services and ` +
        `invalidates context for ${result.activeAgents.length} active AI agents. ` +
        `Risk ${result.riskScore}/100. Approve propagation?`
      : `${result.changedFiles.join(", ")} is low risk (${result.riskScore}/100). Safe to propagate automatically.`;

  res.json({
    ...result,
    threshold: HIGH_RISK_THRESHOLD,
    decision: { gate, summary },
  });
});

// Write-back: propagate the change once approved (or auto for low risk).
app.post("/writeback", async (req, res) => {
  const changedFiles: string[] = req.body?.changedFiles ?? [];
  const approved: boolean = req.body?.approved ?? false;
  if (!approved) {
    return res.status(409).json({ written: false, reason: "not_approved" });
  }
  const result = analyzeImpact(graph, changedFiles);
  // "Regenerate" affected docs + refresh context, then clear staleness.
  await markStale([...staleNodes], false);
  staleNodes.clear();
  res.json({
    written: true,
    regeneratedDocs: result.affectedDocs,
    notifiedAgents: result.affectedAgents.map((a) => a.label),
    refreshedServices: result.affectedServices,
    message: "Knowledge graph updated, documentation regenerated, AI agents notified.",
  });
});

// Visualization data.
app.get("/graph", (_req, res) => {
  const nodes = [...graph.nodes.values()].map((n) => ({
    id: n.id,
    label: n.label,
    kind: n.kind,
    status: n.status ?? null,
    stale: staleNodes.has(n.id),
  }));
  const links = graph.edges.map((e) => ({ source: e.from, target: e.to, type: e.type }));
  res.json({ nodes, links });
});

// Active AI agent sessions (what would be working with stale context).
app.get("/sessions", (_req, res) => {
  const agents = [...graph.nodes.values()]
    .filter((n) => n.kind === "agent")
    .map((n) => ({ agent: n.label, status: n.status }));
  res.json({ sessions: agents });
});

initNeo4j();
syncGraph(graph);
app.listen(PORT, () => {
  console.log(`[guardian] listening on :${PORT}  (repo: ${ACME_REPO_PATH})`);
  console.log(`[guardian] graph: ${graph.nodes.size} nodes, ${graph.edges.length} edges`);
});
