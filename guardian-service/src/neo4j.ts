// neo4j.ts
// Optional mirror of the in-memory graph into Neo4j for the visualization
// money-shot. The service runs fine without Neo4j — every call here degrades
// gracefully so the demo can never be blocked by a DB connection.

import neo4j, { Driver } from "neo4j-driver";
import type { Graph } from "./graph.js";

let driver: Driver | null = null;
let enabled = false;

export function initNeo4j(): boolean {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !user || !password) {
    console.log("[neo4j] disabled (NEO4J_* not set) — running in-memory only");
    return false;
  }
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    enabled = true;
    console.log(`[neo4j] enabled -> ${uri}`);
    return true;
  } catch (e) {
    console.warn("[neo4j] init failed, continuing in-memory only:", (e as Error).message);
    return false;
  }
}

export function isNeo4jEnabled(): boolean {
  return enabled;
}

/** Mirror the whole graph into Neo4j (idempotent: clears the demo graph first). */
export async function syncGraph(graph: Graph): Promise<void> {
  if (!enabled || !driver) return;
  const session = driver.session();
  try {
    await session.run("MATCH (n:Acme) DETACH DELETE n");
    for (const n of graph.nodes.values()) {
      await session.run(
        "CREATE (:Acme {id:$id, kind:$kind, label:$label, service:$service, status:$status, stale:false})",
        { id: n.id, kind: n.kind, label: n.label, service: n.service ?? null, status: n.status ?? null }
      );
    }
    for (const e of graph.edges) {
      await session.run(
        `MATCH (a:Acme {id:$from}), (b:Acme {id:$to})
         CREATE (a)-[:REL {type:$type}]->(b)`,
        { from: e.from, to: e.to, type: e.type }
      );
    }
  } catch (e) {
    console.warn("[neo4j] syncGraph failed:", (e as Error).message);
  } finally {
    await session.close();
  }
}

/** Mark a set of node ids as stale (used after a high-risk merge is detected). */
export async function markStale(ids: string[], stale: boolean): Promise<void> {
  if (!enabled || !driver || ids.length === 0) return;
  const session = driver.session();
  try {
    await session.run("MATCH (n:Acme) WHERE n.id IN $ids SET n.stale=$stale", { ids, stale });
  } catch (e) {
    console.warn("[neo4j] markStale failed:", (e as Error).message);
  } finally {
    await session.close();
  }
}

export async function closeNeo4j(): Promise<void> {
  if (driver) await driver.close();
}
