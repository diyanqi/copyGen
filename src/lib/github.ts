import { stripComments, sanitizeCode } from "@/lib/utils";

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at: string;
  owner: { login: string };
  html_url: string;
  default_branch: string;
}

interface GitHubFile {
  path: string;
  type: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree: GitHubFile[];
}

interface GitHubContentResponse {
  content: string;
  encoding: string;
}

// Non-core code files — excluded from source code document
const NON_CODE_EXT = new Set([
  ".css", ".scss", ".less", ".sass", ".styl",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg",
  ".md", ".txt", ".rst", ".doc",
  ".html", ".htm", ".xml", ".svg",
  ".lock", ".map",
  ".env", ".gitignore", ".gitattributes",
  ".editorconfig", ".prettierrc", ".eslintrc",
]);

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".mp4", ".mp3", ".avi", ".mov", ".wav",
  ".ttf", ".woff", ".woff2", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib",
  ".pyc", ".pyo", ".class", ".o",
]);

const IGNORED_DIRS = new Set([
  "node_modules", ".next", "dist", "build", "vendor",
  "__pycache__", ".git", ".github", ".vscode", ".idea",
  "coverage", ".turbo", ".cache", "target", "bin", "obj",
]);

const IGNORED_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "bun.lockb", "Cargo.lock", "poetry.lock",
  ".DS_Store", "Thumbs.db",
  "README.md", "README", "README.txt", "README.rst",
  "LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md",
  "CHANGELOG.md", "CHANGELOG", "CHANGES.md",
  "CONTRIBUTING.md", "CODE_OF_CONDUCT.md",
  "SECURITY.md", "NOTICE", "NOTICE.md",
  ".gitignore", ".gitattributes", ".editorconfig",
  ".prettierrc", ".prettierrc.json", ".prettierrc.js",
  ".eslintrc", ".eslintrc.json", ".eslintrc.js",
  "tsconfig.json", "jsconfig.json",
  ".env.example", ".env.sample",
  "Makefile.am", "configure.ac",
]);

const IGNORED_PATTERNS = [
  /\.test\.\w+$/, /\.spec\.\w+$/, /\.min\.\w+$/, /\.map$/, /\.d\.ts$/,
];

function shouldIgnore(path: string): boolean {
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];
  for (const dir of parts.slice(0, -1)) {
    if (IGNORED_DIRS.has(dir)) return true;
  }
  if (IGNORED_FILES.has(fileName)) return true;
  const ext = "." + fileName.split(".").pop()?.toLowerCase();
  if (BINARY_EXT.has(ext)) return true;
  for (const p of IGNORED_PATTERNS) {
    if (p.test(fileName)) return true;
  }
  return false;
}

function getExt(path: string): string {
  const fileName = path.split("/").pop() || "";
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot).toLowerCase() : "";
}

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error("获取仓库列表失败，请检查 Token");
  return res.json();
}

async function fetchTree(
  token: string, owner: string, repo: string, branch: string
): Promise<GitHubFile[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error("获取仓库文件树失败");
  const data: GitHubTreeResponse = await res.json();
  return data.tree.filter((f) => f.type === "blob" && !shouldIgnore(f.path));
}

async function fetchContent(
  token: string, owner: string, repo: string, path: string
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return "";
  const data: GitHubContentResponse = await res.json();
  if (data.encoding === "base64") {
    return atob(data.content.replace(/\n/g, ""));
  }
  return data.content;
}

// ── Smart filtering: prioritize by language ratio ──

function filterByLanguageRatio(tree: GitHubFile[]): GitHubFile[] {
  // Count files by extension
  const extCounts: Record<string, number> = {};
  for (const f of tree) {
    const ext = getExt(f.path);
    if (!NON_CODE_EXT.has(ext)) {
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
  }

  // Find dominant extensions (top 3 by count, must be > 5% of total)
  const total = Object.values(extCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return tree;

  const dominantExts = new Set(
    Object.entries(extCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .filter(([, count]) => count / total > 0.05)
      .map(([ext]) => ext)
  );

  // If no dominant extensions found, keep all non-NON_CODE files
  if (dominantExts.size === 0) return tree.filter((f) => !NON_CODE_EXT.has(getExt(f.path)));

  // Keep files with dominant extensions + any non-NON_CODE file if it's in top 3 langs
  return tree.filter((f) => {
    const ext = getExt(f.path);
    if (NON_CODE_EXT.has(ext)) return false;
    if (dominantExts.has(ext)) return true;
    return false;
  });
}

const MAX_FILES = 200;
const MAX_TOTAL_CHARS = 500_000;

export async function fetchRepoFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  onProgress?: (msg: string, percent: number) => void
): Promise<{
  files: { path: string; content: string }[];
  allFilePaths: string[];
  languages: string[];
  extRatios: { ext: string; count: number; ratio: number }[];
  totalTreeSize: number;
}> {
  onProgress?.("正在读取仓库文件列表...", 5);
  const fullTree = await fetchTree(token, owner, repo, branch);

  // Compute extension ratios from full tree (for AI and UI)
  const extCounts: Record<string, number> = {};
  for (const f of fullTree) {
    const ext = getExt(f.path);
    if (ext) extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  const totalFiles = fullTree.length;
  const extRatios = Object.entries(extCounts)
    .map(([ext, count]) => ({ ext, count, ratio: count / totalFiles }))
    .sort((a, b) => b.count - a.count);

  // Collect all file paths (for dev tools detection)
  const allFilePaths = fullTree.map((f) => f.path);

  // Collect languages from dominant code extensions
  const languages = extRatios
    .filter((r) => !NON_CODE_EXT.has(r.ext) && r.ratio > 0.03)
    .slice(0, 10)
    .map((r) => r.ext.replace(".", "").toUpperCase());

  // Filter to substantive code files
  const filteredTree = filterByLanguageRatio(fullTree);
  const filesToRead = filteredTree.slice(0, MAX_FILES);
  const total = filesToRead.length;

  const files: { path: string; content: string }[] = [];
  let totalChars = 0;
  let stopped = false;

  const BATCH = 10;
  for (let i = 0; i < total; i += BATCH) {
    if (stopped) break;
    const batch = filesToRead.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (f) => {
        const raw = await fetchContent(token, owner, repo, f.path);
        // Strip comments and sanitize
        const cleaned = stripComments(sanitizeCode(raw), f.path);
        return { path: f.path, content: cleaned };
      })
    );
    for (const r of results) {
      files.push(r);
      totalChars += r.content.length;
      if (totalChars >= MAX_TOTAL_CHARS) {
        stopped = true;
        break;
      }
    }
    const read = Math.min(i + BATCH, total);
    const percent = 5 + Math.round((read / total) * 20);
    onProgress?.(`正在读取文件... (${files.length}/${filteredTree.length})${stopped ? " (已足够)" : ""}`, percent);
  }

  return { files, allFilePaths, languages, extRatios, totalTreeSize: fullTree.length };
}

// ── Lightweight stats: fetch tree only, no content ──

export async function fetchRepoStats(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{
  allFilePaths: string[];
  languages: string[];
  estimatedLines: number;
  totalTreeSize: number;
}> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error("获取仓库文件树失败");
  const data: GitHubTreeResponse = await res.json();
  const tree = data.tree.filter((f) => f.type === "blob" && !shouldIgnore(f.path));

  const allFilePaths = tree.map((f) => f.path);

  // Extension ratios
  const extCounts: Record<string, number> = {};
  let totalSize = 0;
  for (const f of tree) {
    const ext = getExt(f.path);
    if (ext) extCounts[ext] = (extCounts[ext] || 0) + 1;
    totalSize += f.size || 0;
  }
  const totalFiles = tree.length;
  const extRatios = Object.entries(extCounts)
    .map(([ext, count]) => ({ ext, count, ratio: count / totalFiles }))
    .sort((a, b) => b.count - a.count);

  const languages = extRatios
    .filter((r) => !NON_CODE_EXT.has(r.ext) && r.ratio > 0.03)
    .slice(0, 10)
    .map((r) => r.ext.replace(".", "").toUpperCase());

  // Estimate lines: ~40 bytes per line of code on average
  const estimatedLines = Math.round(totalSize / 40);

  return { allFilePaths, languages, estimatedLines, totalTreeSize: tree.length };
}
