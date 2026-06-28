// cli-impact.ts — quick local check without the HTTP server.
// Usage: npm run impact -- shared-sdk/auth.ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildGraph } from "./graph.js";
import { analyzeImpact } from "./impact.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, "../../acme-commerce");
const changed = process.argv.slice(2);
if (changed.length === 0) {
  console.error("usage: npm run impact -- <changed-file> [more...]");
  process.exit(1);
}
const graph = buildGraph(repo);
console.log(`graph: ${graph.nodes.size} nodes, ${graph.edges.length} edges\n`);
console.log(JSON.stringify(analyzeImpact(graph, changed), null, 2));
