// github.ts
// Fetch the list of files changed by a pull request, so Guardian can analyze a
// PR by number instead of a hand-typed file list. This is what makes the flow
// "open a PR -> Guardian checks it" real.

export interface PrInfo {
  repo: string; // "owner/name"
  prNumber: number;
  files: string[]; // repo-relative paths, prefix-normalized for the graph
}

// Files in the demo monorepo live under acme-commerce/. The Guardian graph keys
// are relative to that folder, so we strip the prefix from PR paths.
const PREFIX = process.env.ACME_PREFIX ?? "acme-commerce/";
const DEFAULT_REPO =
  process.env.GUARDIAN_PR_REPO ?? "Priyammm05/oynix-guardian-uipath-agenthack";

function normalize(path: string): string {
  return path.startsWith(PREFIX) ? path.slice(PREFIX.length) : path;
}

/** Fetch changed files for a PR via the GitHub REST API. */
export async function fetchPrFiles(
  prNumber: number,
  repo: string = DEFAULT_REPO
): Promise<PrInfo> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "oynix-guardian",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=100`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${repo}#${prNumber}: ${await res.text()}`);
  }
  const data = (await res.json()) as { filename: string }[];
  const files = data.map((f) => normalize(f.filename));
  return { repo, prNumber, files };
}

export interface MergeResult {
  merged: boolean;
  sha?: string;
  message?: string;
}

/** Merge a PR into its base branch — the real "propagate to main" on approval. */
export async function mergePr(
  prNumber: number,
  repo: string = DEFAULT_REPO
): Promise<MergeResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN required to merge a PR");
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}/merge`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "oynix-guardian",
    },
    body: JSON.stringify({ merge_method: "merge" }),
  });
  const data = (await res.json()) as { merged?: boolean; sha?: string; message?: string };
  if (!res.ok) {
    throw new Error(`merge failed ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  }
  return { merged: data.merged === true, sha: data.sha, message: data.message };
}
