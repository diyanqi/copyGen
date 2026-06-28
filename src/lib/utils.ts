// ── Secret redaction ──

export function sanitizeCode(code: string): string {
  return code
    .replace(
      /(?:(?:api[_-]?key|apikey|secret|password|passwd|token|auth)[\s]*[=:]\s*["'][^"']+["'])/gi,
      (match) => {
        const parts = match.split(/[=:]/);
        return parts[0] + '="[REDACTED]"';
      }
    )
    .replace(/(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36})/g, "[REDACTED]");
}

// ── Comment stripping ──

const SLASH_SLASH_LANGS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".h", ".hpp",
  ".cs", ".go", ".rs", ".swift", ".kt", ".kts", ".scala", ".groovy",
  ".dart", ".vue", ".svelte", ".proto",
]);

const HASH_LANGS = new Set([
  ".py", ".rb", ".sh", ".bash", ".zsh", ".pl", ".pm", ".r", ".yml",
  ".yaml", ".toml", ".conf", ".cfg", ".ini", ".dockerfile",
]);

const DASH_LANGS = new Set([".sql", ".lua", ".hs", ".lhs", ".elm"]);
const SEMICOLON_LANGS = new Set([".asm", ".s", ".lisp", ".clj", ".rkt"]);
const VB_LANGS = new Set([".vb", ".vbs", ".bas"]);

function getCommentPrefix(ext: string): string | null {
  if (SLASH_SLASH_LANGS.has(ext)) return "//";
  if (HASH_LANGS.has(ext)) return "#";
  if (DASH_LANGS.has(ext)) return "--";
  if (SEMICOLON_LANGS.has(ext)) return ";";
  if (VB_LANGS.has(ext)) return "'";
  return null;
}

export function stripComments(code: string, filePath: string): string {
  const ext = "." + (filePath.split(".").pop()?.toLowerCase() || "");
  const prefix = getCommentPrefix(ext);

  if (!prefix) return code;

  const lines = code.split("\n");
  const result: string[] = [];
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Handle /* */ block comments (for C-style languages)
    if (SLASH_SLASH_LANGS.has(ext)) {
      if (inBlockComment) {
        if (trimmed.includes("*/")) {
          inBlockComment = false;
          const after = trimmed.slice(trimmed.indexOf("*/") + 2).trim();
          if (after) result.push(after);
        }
        continue;
      }
      if (trimmed.startsWith("/*")) {
        if (trimmed.includes("*/")) {
          // Single-line block comment
          const after = trimmed.slice(trimmed.indexOf("*/") + 2).trim();
          if (after) result.push(after);
        } else {
          inBlockComment = true;
        }
        continue;
      }
    }

    // Handle Python docstrings
    if (ext === ".py") {
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        const quote = trimmed.slice(0, 3);
        if (trimmed.endsWith(quote) && trimmed.length > 6) {
          continue; // single-line docstring
        }
        inBlockComment = true;
        continue;
      }
      if (inBlockComment) {
        if (trimmed.endsWith('"""') || trimmed.endsWith("'''")) {
          inBlockComment = false;
        }
        continue;
      }
    }

    // Single-line comment
    if (trimmed.startsWith(prefix)) continue;

    // Inline comment (only strip if the comment part is significant)
    const idx = line.indexOf(prefix);
    if (idx > 0) {
      // For // style, make sure it's not inside a string (simple heuristic)
      if (prefix === "//" || prefix === "--" || prefix === "#") {
        const before = line.slice(0, idx).trimEnd();
        if (before) {
          result.push(before);
          continue;
        }
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

// ── Line compression ──

export function compressEmptyLines(code: string): string {
  return code.replace(/(\n\s*){3,}/g, "\n\n");
}

// ── Pagination for 程序鉴别材料 ──

const LINES_PER_PAGE = 50;

export function selectCodeLines(allLines: string[]): string[] {
  const totalLines = allLines.length;
  const totalPages = Math.ceil(totalLines / LINES_PER_PAGE);
  const TARGET_PAGES = 35;
  const MAX_PAGES = 45;

  if (totalPages > MAX_PAGES) {
    const frontPages = 23;
    const backPages = 22;
    const front = allLines.slice(0, frontPages * LINES_PER_PAGE);
    const back = allLines.slice(-backPages * LINES_PER_PAGE);
    return [...front, "// ==================== 以下为后续代码 ====================", ...back];
  }

  if (totalPages >= TARGET_PAGES) return allLines;

  const result = [...allLines];
  const targetLines = TARGET_PAGES * LINES_PER_PAGE;
  while (result.length < targetLines) result.push("");
  return result;
}

// ── Misc ──

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ── Browser UA parsing ──

export function parseUserAgent(): { hardware: string; os: string; platform: string; cores: number; memory: number } {
  if (typeof navigator === "undefined") return { hardware: "PC", os: "Unknown", platform: "Unknown", cores: 4, memory: 8 };

  const ua = navigator.userAgent;
  const platform = typeof navigator.platform !== "undefined" ? navigator.platform : "Unknown";
  const cores = typeof navigator.hardwareConcurrency !== "undefined" ? navigator.hardwareConcurrency : 4;
  // deviceMemory is in GB, only available in Chrome/Edge
  const memory = typeof (navigator as { deviceMemory?: number }).deviceMemory === "number"
    ? (navigator as { deviceMemory?: number }).deviceMemory!
    : 8;

  let os = "Unknown";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6/.test(ua)) os = "Windows 7/8";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X ([\d_]+)/.test(ua)) os = "macOS " + (ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, ".") || "");
  else if (/Linux/.test(ua)) os = "Linux";
  else if (/Android ([\d.]+)/.test(ua)) os = "Android " + (ua.match(/Android ([\d.]+)/)?.[1] || "");
  else if (/OS ([\d_]+) like Mac/.test(ua)) os = "iOS " + (ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") || "");

  return { hardware: `${platform}, ${cores}核, ${memory}GB内存`, os, platform, cores, memory };
}

// ── Language detection ──

const EXT_TO_LANG: Record<string, string> = {
  ".js": "JavaScript", ".ts": "JavaScript", ".jsx": "JavaScript", ".tsx": "JavaScript",
  ".py": "Python", ".java": "Java", ".c": "C", ".cpp": "C++", ".h": "C", ".hpp": "C++",
  ".cs": "C#", ".go": "Go", ".rs": "Rust", ".rb": "Ruby", ".php": "PHP",
  ".swift": "Swift", ".kt": "Java", ".scala": "Java", ".dart": "C#",
  ".sql": "SQL", ".r": "R", ".m": "MATLAB", ".pl": "Perl",
  ".html": "HTML", ".css": "JavaScript", ".vue": "JavaScript", ".svelte": "JavaScript",
  ".sh": "Python", ".bash": "Python",
  ".vb": "Visual Basic", ".vbs": "Visual Basic",
  ".lua": "Python", ".hs": "Python", ".elm": "Python",
  ".asm": "Assembly", ".s": "Assembly",
};

export function detectLanguages(files: { path: string }[]): { lang: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const ext = "." + (f.path.split(".").pop()?.toLowerCase() || "");
    const lang = EXT_TO_LANG[ext];
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Dev tools detection ──

export function detectDevTools(filePaths: string[]): string {
  const tools: string[] = [];
  const paths = new Set(filePaths);
  const hasAny = (patterns: string[]) => patterns.some((p) => paths.has(p) || filePaths.some((f) => f.startsWith(p)));

  if (hasAny([".vscode/"])) tools.push("VS Code");
  if (hasAny([".idea/"])) tools.push("IntelliJ IDEA");
  if (hasAny(["package.json"])) tools.push("Node.js / npm");
  if (hasAny(["Cargo.toml"])) tools.push("Rust / Cargo");
  if (hasAny(["go.mod"])) tools.push("Go");
  if (hasAny(["pom.xml", "build.gradle"])) tools.push("Maven / Gradle");
  if (hasAny(["requirements.txt", "Pipfile", "pyproject.toml"])) tools.push("Python / pip");
  if (hasAny(["Gemfile"])) tools.push("Ruby / Bundler");
  if (hasAny(["composer.json"])) tools.push("PHP / Composer");
  if (hasAny(["Makefile", "CMakeLists.txt"])) tools.push("Make / CMake");
  if (hasAny(["Dockerfile", "docker-compose.yml"])) tools.push("Docker");
  if (hasAny([".github/workflows/"])) tools.push("GitHub Actions");

  return tools.length > 0 ? tools.join(", ") : "未检测到特定开发工具";
}

// ── Checkbox option constants ──

export const GIVEN_LANGUAGES = [
  "Assembly", "C", "C#", "C++", "Delphi/Object Pascal", "Go", "HTML",
  "Java", "JavaScript", "MATLAB", "Objective-C", "PHP", "PL/SQL",
  "Perl", "Python", "R", "Ruby", "SQL", "Swift", "Visual Basic", "Visual Basic .Net",
];

export const GIVEN_TECH_CATEGORIES = [
  "APP", "游戏软件", "教育软件", "金融软件", "医疗软件", "地理信息软件",
  "云计算软件", "信息安全软件", "大数据软件", "人工智能软件", "VR软件",
  "5G软件", "小程序", "物联网软件", "智慧城市软件",
];

export const SOFTWARE_CATEGORIES = ["应用软件", "嵌入式软件", "中间件", "操作系统"];
