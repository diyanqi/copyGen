"use client";
import Logo from "@/components/Logo";


import { useSession } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { getAIKey, createProject, createEmptyMeta, type SoftwareMeta } from "@/lib/storage";
import { fetchUserRepos, type GitHubRepo } from "@/lib/github";
import { callAIForText, buildAutoNamePrompt, buildCategoryPrompt, buildLanguagesPrompt, buildTechCategoriesPrompt } from "@/lib/ai-helpers";
import { GIVEN_LANGUAGES, GIVEN_TECH_CATEGORIES, SOFTWARE_CATEGORIES, parseUserAgent } from "@/lib/utils";

const PAGE_SIZE = 12;

function NewProjectContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [softwareName, setSoftwareName] = useState("");
  const [version, setVersion] = useState("V1.0");
  const [completedAt, setCompletedAt] = useState("");
  const [category, setCategory] = useState("应用软件");
  const [meta, setMeta] = useState<SoftwareMeta>(createEmptyMeta());
  const [submitting, setSubmitting] = useState(false);
  const [generatingName, setGeneratingName] = useState(false);
  const [generatingCategory, setGeneratingCategory] = useState(false);
  const [error, setError] = useState("");

  const accessToken = (session as { accessToken?: string })?.accessToken;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (session && !getAIKey()) router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    if (accessToken) {
      fetchUserRepos(accessToken)
        .then((data) => { setRepos(data); setLoading(false); })
        .catch((e) => { setError(e.message); setLoading(false); });
    }
  }, [accessToken]);

  const filteredRepos = useMemo(() =>
    repos.filter((r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.full_name.toLowerCase().includes(search.toLowerCase())
    ), [repos, search]);

  const totalPages = Math.ceil(filteredRepos.length / PAGE_SIZE);
  const pagedRepos = filteredRepos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSelectRepo = useCallback((repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setCompletedAt(repo.pushed_at ? repo.pushed_at.slice(0, 10) : "");

    const { os, cores, memory } = parseUserAgent();
    setMeta((prev) => ({
      ...prev,
      devHardware: `PC, ${os}, ${cores}核CPU, ${memory}GB内存`,
      runHardware: `PC, ${os}, ${cores}核CPU, ${memory}GB内存`,
      devOS: os,
      devTools: "未检测到特定开发工具",
      languagesGiven: [],
    }));

    if (!getAIKey()) return;

    setGeneratingName(true);
    callAIForText(buildAutoNamePrompt(repo.name, repo.description || "", repo.language || ""))
      .then((name) => {
        if (name) {
          name = name.replace(/^["'""]|["'""]$/g, "").trim();
          if (!name.endsWith("软件")) name += "软件";
          setSoftwareName(name);
        }
      })
      .catch(() => {})
      .finally(() => setGeneratingName(false));

    // Auto-detect category
    setGeneratingCategory(true);
    callAIForText(buildCategoryPrompt(repo.name, repo.description || "", repo.language || ""))
      .then((cat) => {
        if (cat && SOFTWARE_CATEGORIES.includes(cat.trim())) {
          setCategory(cat.trim());
        }
      })
      .catch(() => {})
      .finally(() => setGeneratingCategory(false));

    // Auto-detect languages
    callAIForText(buildLanguagesPrompt(repo.name, repo.description || "", repo.language || ""))
      .then((text) => {
        const langs = text.split(",").map((s) => s.trim()).filter((s) => GIVEN_LANGUAGES.includes(s));
        // Also auto-map from GitHub's primary language
        const langMap: Record<string, string> = { TypeScript: "JavaScript", Kotlin: "Java", Scala: "Java", Dart: "C#", Rust: "C++", Shell: "Python", Bash: "Python", Vue: "JavaScript", Svelte: "JavaScript" };
        const autoLang = langMap[repo.language || ""] || repo.language || "";
        if (autoLang && GIVEN_LANGUAGES.includes(autoLang) && !langs.includes(autoLang)) langs.unshift(autoLang);
        if (langs.length > 0) setMeta((prev) => ({ ...prev, languagesGiven: langs }));
      })
      .catch(() => {});

    // Auto-detect tech categories — always must have at least one
    callAIForText(buildTechCategoriesPrompt(repo.name, repo.description || "", repo.language || ""))
      .then((text) => {
        const cats = text.split(",").map((s) => s.trim()).filter((s) => GIVEN_TECH_CATEGORIES.includes(s));
        // Fallback: if no match, default to "应用软件" mapped into given categories
        if (cats.length === 0) cats.push("APP");
        setMeta((prev) => ({ ...prev, techCategoriesGiven: cats }));
      })
      .catch(() => {
        // On AI failure, set a default
        setMeta((prev) => ({ ...prev, techCategoriesGiven: ["APP"] }));
      });
  }, []);

  const toggleLanguage = (lang: string) => {
    setMeta((prev) => ({
      ...prev,
      languagesGiven: prev.languagesGiven.includes(lang)
        ? prev.languagesGiven.filter((l) => l !== lang)
        : [...prev.languagesGiven, lang],
    }));
  };

  const toggleTechCategory = (cat: string) => {
    setMeta((prev) => ({
      ...prev,
      techCategoriesGiven: prev.techCategoriesGiven.includes(cat)
        ? prev.techCategoriesGiven.filter((c) => c !== cat)
        : [...prev.techCategoriesGiven, cat],
    }));
  };

  const handleSubmit = () => {
    if (!selectedRepo || !softwareName.trim()) return;
    setSubmitting(true);
    const project = createProject({
      repoOwner: selectedRepo.owner.login,
      repoName: selectedRepo.name,
      repoUrl: selectedRepo.html_url,
      defaultBranch: selectedRepo.default_branch || "main",
      softwareName: softwareName.trim(),
      version,
      completedAt,
      meta: { ...meta, category },
    });
    router.push(`/projects/${project.id}`);
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="spinner w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-[var(--color-border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold">软著通</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">返回控制台</Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <h1 className="text-2xl font-bold mb-8">新建项目</h1>
        {error && <div className="bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-xl p-4 mb-6 text-sm text-[var(--color-error)]">{error}</div>}

        {/* Step 1: Select repo */}
        {!selectedRepo ? (
          <div>
            <div className="mb-6">
              <input type="text" placeholder="搜索仓库..." value={search} onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
              {!loading && <div className="flex items-center justify-between mt-2 text-xs text-[var(--color-muted)]">
                <span>共 {filteredRepos.length} 个仓库</span>
                {totalPages > 1 && <span>第 {page} / {totalPages} 页</span>}
              </div>}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-20"><div className="spinner w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" /></div>
            ) : filteredRepos.length === 0 ? (
              <div className="text-center py-16 text-[var(--color-muted)]">{search ? "没有匹配的仓库" : "没有找到仓库"}</div>
            ) : (
              <>
                <div className="grid gap-3">
                  {pagedRepos.map((repo) => (
                    <button key={repo.id} onClick={() => handleSelectRepo(repo)}
                      className="text-left bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-primary)]/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">{repo.full_name}</div>
                        <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                          {repo.language && <span className="px-2 py-0.5 bg-[var(--color-border)] rounded">{repo.language}</span>}
                          <span>★ {repo.stargazers_count}</span>
                        </div>
                      </div>
                      {repo.description && <p className="text-sm text-[var(--color-muted)] line-clamp-2">{repo.description}</p>}
                    </button>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                      className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:border-[var(--color-muted)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">上一页</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2).map((p, idx, arr) => (
                      <span key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-[var(--color-muted)]">...</span>}
                        <button onClick={() => setPage(p)} className={`w-8 h-8 text-sm rounded-lg transition-colors ${p === page ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"}`}>{p}</button>
                      </span>
                    ))}
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:border-[var(--color-muted)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">下一页</button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Step 2: Form */
          <div>
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-[var(--color-muted)] mb-1">已选择仓库</div>
                  <div className="font-medium">{selectedRepo.full_name}</div>
                </div>
                <button onClick={() => setSelectedRepo(null)} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">更换</button>
              </div>
            </div>

            <div className="space-y-5">
              {/* Software name - auto generated */}
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-2">软件全称 *</label>
                <input type="text" value={softwareName} onChange={(e) => setSoftwareName(e.target.value)} placeholder={generatingName ? "AI 生成中..." : "xxx软件"}
                  className="w-full px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
                {generatingName && <p className="text-xs text-[var(--color-primary)] mt-1">正在自动生成软件名称...</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--color-muted)] mb-2">版本号</label>
                  <input type="text" value={version} onChange={(e) => setVersion(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-muted)] mb-2">开发完成日期</label>
                  <input type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
                </div>
              </div>

              {/* Software category */}
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-2">软件分类</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]">
                  {SOFTWARE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {generatingCategory && <p className="text-xs text-[var(--color-primary)] mt-1">正在自动判断分类...</p>}
              </div>

              {/* Programming languages - checkboxes */}
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-2">编程语言（给定项）</label>
                <div className="flex flex-wrap gap-2">
                  {GIVEN_LANGUAGES.map((lang) => (
                    <button key={lang} onClick={() => toggleLanguage(lang)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${meta.languagesGiven.includes(lang) ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-muted)]"}`}>
                      {lang}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="补充语言（逗号分隔）" value={meta.languagesExtra.join(", ")}
                  onChange={(e) => setMeta({ ...meta, languagesExtra: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  className="w-full mt-2 px-3 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
              </div>

              {/* Technical categories - checkboxes */}
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-2">技术特点分类</label>
                <div className="flex flex-wrap gap-2">
                  {GIVEN_TECH_CATEGORIES.map((cat) => (
                    <button key={cat} onClick={() => toggleTechCategory(cat)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${meta.techCategoriesGiven.includes(cat) ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-muted)]"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="补充分类（逗号分隔）" value={meta.techCategoriesExtra.join(", ")}
                  onChange={(e) => setMeta({ ...meta, techCategoriesExtra: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  className="w-full mt-2 px-3 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
              </div>

              <button onClick={handleSubmit} disabled={submitting || !softwareName.trim()}
                className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "创建中..." : "创建项目"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function NewProjectPage() {
  return <SessionProvider><NewProjectContent /></SessionProvider>;
}
