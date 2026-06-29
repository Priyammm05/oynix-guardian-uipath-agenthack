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
import { analyzeImpact, HIGH_RISK_THRESHOLD, type ImpactResult } from "./impact.js";
import { initNeo4j, syncGraph, markStale, isNeo4jEnabled } from "./neo4j.js";
import { fetchPrFiles, mergePr } from "./github.js";
import { regenerateDocs } from "./docgen.js";

// Optional Oynix enrichment. The client (./oynix.ts) is gitignored to keep
// Oynix internals private, so it may be absent in a public checkout — load it
// lazily and fall back to built-in analysis if it isn't there.
type Enricher = (files: string[]) => Promise<{ used: boolean; source?: string; explanation?: string }>;
let _enrich: Enricher | null = null;
let _enrichTried = false;
async function enrichWithOynix(changedFiles: string[]) {
  if (!_enrichTried) {
    _enrichTried = true;
    try {
      _enrich = (await import("./oynix.js")).enrichWithOynix as Enricher;
    } catch {
      _enrich = null; // file not present in this checkout
    }
  }
  return _enrich ? _enrich(changedFiles) : { used: false };
}

// Load .env into process.env (Node 20.12+/21.7+ built-in, no dependency).
try {
  process.loadEnvFile();
} catch {
  /* no .env present — fall back to ambient environment */
}

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

// Build the full impact response (shared by /impact and /impact-pr), including
// the gate decision and an optional Oynix enrichment.
async function buildImpactResponse(result: ImpactResult, extra: Record<string, unknown> = {}) {
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

  // Optional: ask the real Oynix engine to explain the impact (fail-soft).
  const oynix = await enrichWithOynix(result.changedFiles);

  return {
    ...result,
    threshold: HIGH_RISK_THRESHOLD,
    decision: { gate, summary },
    oynix,
    ...extra,
  };
}

// Impact Analysis Agent + Decision Engine — analyze an explicit file list.
app.post("/impact", async (req, res) => {
  const changedFiles: string[] = req.body?.changedFiles ?? [];
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return res.status(400).json({ error: "changedFiles[] required" });
  }
  const result = analyzeImpact(graph, changedFiles);
  res.json(await buildImpactResponse(result));
});

// Analyze a pull request by number: Guardian fetches the PR's changed files
// from GitHub itself, then runs the impact analysis. This powers the
// "open a PR -> Guardian checks it" trigger.
app.post("/impact-pr", async (req, res) => {
  const prNumber = Number(req.body?.prNumber);
  const repo: string | undefined = req.body?.repo;
  if (!prNumber || Number.isNaN(prNumber)) {
    return res.status(400).json({ error: "prNumber required" });
  }
  try {
    const pr = await fetchPrFiles(prNumber, repo);
    if (pr.files.length === 0) {
      return res.status(422).json({ error: "no changed files found for PR", pr });
    }
    const result = analyzeImpact(graph, pr.files);
    res.json(await buildImpactResponse(result, { prNumber: pr.prNumber, repo: pr.repo, prFiles: pr.files }));
  } catch (e) {
    res.status(502).json({ error: "github_fetch_failed", detail: (e as Error).message });
  }
});

// Write-back: once approved, merge the PR to main AND propagate the change
// (update graph, regenerate docs, notify agents). Accepts a prNumber (merges
// that PR) or an explicit changedFiles list.
app.post("/writeback", async (req, res) => {
  const approved: boolean = req.body?.approved ?? false;
  const prNumber = Number(req.body?.prNumber);
  const repo: string | undefined = req.body?.repo;
  if (!approved) {
    return res.status(409).json({ written: false, reason: "not_approved" });
  }
  try {
    let changedFiles: string[] = req.body?.changedFiles ?? [];
    let merge: { merged: boolean; sha?: string } | null = null;

    // PR-driven: fetch the PR's files and actually merge it to main.
    if (prNumber && !Number.isNaN(prNumber)) {
      const pr = await fetchPrFiles(prNumber, repo);
      changedFiles = pr.files;
      merge = await mergePr(prNumber, repo);
    }

    const result = analyzeImpact(graph, changedFiles);
    // Actually stamp the affected docs so the regeneration is visible on disk.
    const regeneratedDocs = regenerateDocs(ACME_REPO_PATH, result.affectedDocs, prNumber || null);
    await markStale([...staleNodes], false);
    staleNodes.clear();

    res.json({
      written: true,
      merged: merge?.merged ?? false,
      mergeSha: merge?.sha ?? null,
      prNumber: prNumber || null,
      regeneratedDocs,
      notifiedAgents: result.affectedAgents.map((a) => a.label),
      refreshedServices: result.affectedServices,
      message: merge?.merged
        ? "PR merged to main. Knowledge graph updated, documentation regenerated, AI agents notified."
        : "Knowledge graph updated, documentation regenerated, AI agents notified.",
    });
  } catch (e) {
    res.status(502).json({ written: false, error: "writeback_failed", detail: (e as Error).message });
  }
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
