// graph.ts
// Builds a REAL dependency graph of the acme-commerce repo by parsing actual
// TypeScript imports, doc references, and AI-agent `depends_on` declarations.
// The risk score is computed from this graph — nothing is hard-coded.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import yaml from "js-yaml";

export type NodeKind = "service" | "file" | "doc" | "agent";

export interface GNode {
  id: string; // repo-relative path, e.g. "shared-sdk/auth.ts" or service name
  kind: NodeKind;
  service?: string; // owning service for file nodes
  status?: "active" | "idle"; // for agent nodes
  label: string;
}

export interface GEdge {
  from: string;
  to: string;
  type: "IMPORTS" | "OWNS" | "REFERENCES" | "DEPENDS_ON";
}

export interface Graph {
  nodes: Map<string, GNode>;
  edges: GEdge[];
  repoRoot: string;
}

const SERVICE_DIRS = [
  "gateway",
  "checkout-service",
  "payment-service",
  "inventory-service",
  "order-service",
  "notification-service",
  "auth-service",
  "shared-sdk",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Resolve a relative import specifier to a repo-relative .ts file id. */
function resolveImport(fromFile: string, spec: string, repoRoot: string): string | null {
  if (!spec.startsWith(".")) return null; // external import, ignore
  const base = resolve(dirname(fromFile), spec);
  // Try base.ts, base/index.ts
  for (const cand of [`${base}.ts`, join(base, "index.ts")]) {
    try {
      if (statSync(cand).isFile()) return relative(repoRoot, cand);
    } catch {
      /* not found, try next */
    }
  }
  return null;
}

function serviceOf(relPath: string): string | undefined {
  const top = relPath.split("/")[0];
  return SERVICE_DIRS.includes(top) ? top : undefined;
}

/** Build the full graph from the acme-commerce repo on disk. */
export function buildGraph(repoRoot: string): Graph {
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const addNode = (n: GNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };

  // service nodes
  for (const svc of SERVICE_DIRS) {
    addNode({ id: svc, kind: "service", label: svc });
  }

  const files = walk(repoRoot);

  // 1) TypeScript files + IMPORTS edges
  const tsFiles = files.filter((f) => f.endsWith(".ts"));
  for (const abs of tsFiles) {
    const rel = relative(repoRoot, abs);
    const svc = serviceOf(rel);
    addNode({ id: rel, kind: "file", service: svc, label: rel });
    if (svc) edges.push({ from: svc, to: rel, type: "OWNS" });
  }
  for (const abs of tsFiles) {
    const rel = relative(repoRoot, abs);
    const src = readFileSync(abs, "utf8");
    const importRe = /import\s+[^;]*?from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const target = resolveImport(abs, m[1], repoRoot);
      if (target && nodes.has(target)) {
        edges.push({ from: rel, to: target, type: "IMPORTS" });
      }
    }
  }

  // 2) docs + REFERENCES edges (doc text mentions a module path)
  const docFiles = files.filter((f) => f.includes("/docs/") && f.endsWith(".md"));
  for (const abs of docFiles) {
    const rel = relative(repoRoot, abs);
    addNode({ id: rel, kind: "doc", label: rel });
    const text = readFileSync(abs, "utf8");
    for (const node of nodes.values()) {
      if (node.kind !== "file") continue;
      const noExt = node.id.replace(/\.ts$/, "");
      if (text.includes(node.id) || text.includes(noExt)) {
        edges.push({ from: rel, to: node.id, type: "REFERENCES" });
      }
    }
  }

  // 3) agents + DEPENDS_ON edges (from YAML front-matter)
  const agentFiles = files.filter((f) => f.includes("/agents/") && f.endsWith(".md"));
  for (const abs of agentFiles) {
    const rel = relative(repoRoot, abs);
    const text = readFileSync(abs, "utf8");
    const fm = parseFrontMatter(text);
    const status = fm.status === "idle" ? "idle" : "active";
    addNode({ id: rel, kind: "agent", status, label: fm.agent ?? rel });
    const deps: string[] = Array.isArray(fm.depends_on) ? fm.depends_on : [];
    for (const dep of deps) {
      // dep may be a file, a doc, or a service id
      const target = nodes.has(dep) ? dep : serviceOf(dep) === dep ? dep : dep;
      edges.push({ from: rel, to: target, type: "DEPENDS_ON" });
    }
  }

  return { nodes, edges, repoRoot };
}

function parseFrontMatter(text: string): Record<string, any> {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  try {
    return (yaml.load(m[1]) as Record<string, any>) ?? {};
  } catch {
    return {};
  }
}
