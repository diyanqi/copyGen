"use client";
import Logo from "@/components/Logo";


import { useSession } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getProject, updateProject, getAIKey, type Project, type SoftwareMeta } from "@/lib/storage";
import { fetchRepoFiles, fetchRepoStats } from "@/lib/github";
import { generateManualMarkdown, callAIForText, buildMetadataPrompt } from "@/lib/ai-helpers";
import { generateCodePDF } from "@/lib/docgen/code-pdf";
import { generateManualPDF } from "@/lib/docgen/manual-pdf";
import { parseUserAgent, detectDevTools, detectLanguages } from "@/lib/utils";

const steps = ["读取仓库代码", "分析代码结构", "AI 生成元数据", "生成程序鉴别材料", "生成文档鉴别材料", "完成"];

function ProjectDetailContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [meta, setMeta] = useState<SoftwareMeta | null>(null);
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(-1);
  const [error, setError] = useState("");
  const [metaReady, setMetaReady] = useState(false);
  const [codePdfUrl, setCodePdfUrl] = useState<string | null>(null);
  const [manualPdfUrl, setManualPdfUrl] = useState<string | null>(null);

  const accessToken = (session as { accessToken?: string })?.accessToken;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (session && !getAIKey()) router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    if (session) {
      const p = getProject(projectId);
      if (!p) { router.push("/dashboard"); return; }
      setProject(p);
      setMeta(p.meta);
    }
  }, [projectId, session, router]);

  // Auto-detect metadata on first visit
  useEffect(() => {
    if (!project || !accessToken || metaReady) return;

    const detectMeta = async () => {
      const { hardware, os, cores, memory } = parseUserAgent();
      setMeta((prev) => prev ? {
        ...prev,
        devHardware: `PC, ${os}, ${cores}核CPU, ${memory}GB内存`,
        runHardware: `PC, ${os}, ${cores}核CPU, ${memory}GB内存`,
        devOS: os,
      } : prev);

      try {
        // Lightweight: only fetch tree, no file content
        const { allFilePaths, languages, estimatedLines } = await fetchRepoStats(
          accessToken, project.repoOwner, project.repoName, project.defaultBranch || "main"
        );

        const devTools = detectDevTools(allFilePaths);

        // Auto-select matching given languages
        // fetchRepoStats returns uppercase extensions: "JS", "PY", "TSX", etc.
        const extToGiven: Record<string, string> = {
          JS: "JavaScript", TS: "JavaScript", JSX: "JavaScript", TSX: "JavaScript",
          PY: "Python", JAVA: "Java", C: "C", CPP: "C++", "C++": "C++", "C#": "C#", CS: "C#",
          GO: "Go", RS: "C++", RB: "Ruby", PHP: "PHP", SWIFT: "Swift",
          KT: "Java", SCALA: "Java", DART: "C#",
          SQL: "SQL", R: "R", PERL: "Perl", LUA: "Python",
          HTML: "HTML", CSS: "JavaScript", VUE: "JavaScript", SVELTE: "JavaScript",
          SH: "Python", BASH: "Python", ASM: "Assembly",
          VB: "Visual Basic", VBS: "Visual Basic",
        };

        const autoLangs = new Set<string>();
        for (const lang of languages) {
          const mapped = extToGiven[lang.toUpperCase()] || extToGiven[lang];
          if (mapped) autoLangs.add(mapped);
        }

        setMeta((prev) => prev ? {
          ...prev,
          devTools,
          languagesGiven: Array.from(autoLangs),
          sourceLines: estimatedLines,
        } : prev);

        // Use tree paths for AI metadata — no file content download needed
        const fileTree = allFilePaths.slice(0, 50).join("\n");
        const languageStr = languages.slice(0, 5).join(", ");

        const aiResult = await callAIForText(
          buildMetadataPrompt(project.repoName, project.repoUrl, languageStr, fileTree, "")
        );

        try {
          const match = aiResult.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            setMeta((prev) => prev ? {
              ...prev,
              runPlatform: parsed.runPlatform || prev.runPlatform,
              runSupport: parsed.runSupport || prev.runSupport,
              purpose: parsed.purpose || prev.purpose,
              domain: parsed.domain || prev.domain,
              mainFeatures: parsed.mainFeatures || prev.mainFeatures,
              technicalFeatures: parsed.technicalFeatures || prev.technicalFeatures,
            } : prev);
          }
        } catch { /* AI response not JSON, skip */ }

        updateProject(projectId, {
          meta: { ...getProject(projectId)!.meta, devTools, languagesGiven: Array.from(autoLangs), sourceLines: estimatedLines },
        });
      } catch { /* fetch failed, skip */ }

      setMetaReady(true);
    };

    detectMeta();
  }, [project, accessToken, projectId, metaReady]);

  const startGenerate = useCallback(async () => {
    if (!project || !accessToken || !meta) return;

    setGenerating(true);
    setError("");
    // Save meta before generating
    updateProject(projectId, { status: "PROCESSING", meta });
    setProject(getProject(projectId)!);

    try {
      // Step 0: Fetch files
      setStepIndex(0); setCurrentStep("正在读取仓库代码..."); setProgress(5);
      const { files, languages: langExts } = await fetchRepoFiles(
        accessToken, project.repoOwner, project.repoName, project.defaultBranch || "main",
        (msg, pct) => { setCurrentStep(msg); setProgress(pct); }
      );

      // Step 1: Analyze
      setStepIndex(1); setCurrentStep("正在分析代码结构..."); setProgress(25);
      const languageStr = langExts.slice(0, 10).join(", ");
      const fileTree = files.slice(0, 50).map((f) => f.path).join("\n");
      const codeSummary = files.slice(0, 10).map((f) => `// ${f.path}\n${f.content.slice(0, 500)}`).join("\n\n").slice(0, 4000);
      const totalSourceLines = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);
      setMeta((prev) => prev ? { ...prev, sourceLines: totalSourceLines } : prev);

      // Step 2: AI metadata (already done in detectMeta, just confirm)
      setStepIndex(2); setCurrentStep("正在确认元数据..."); setProgress(30);

      // Step 3: Generate code PDF (程序鉴别材料)
      setStepIndex(3); setCurrentStep("正在生成程序鉴别材料 PDF..."); setProgress(35);
      const codePDFBlob = await generateCodePDF(project.softwareName, project.version, files);

      // Step 4: Generate manual PDF (文档鉴别材料)
      setStepIndex(4); setCurrentStep("正在生成文档鉴别材料..."); setProgress(50);
      const manualMarkdown = await generateManualMarkdown(
        project.softwareName, project.version, meta,
        project.repoUrl, languageStr, fileTree, codeSummary,
        (msg) => setCurrentStep(msg)
      );

      setCurrentStep("正在排版文档鉴别材料 PDF..."); setProgress(70);
      const manualPDFBlob = await generateManualPDF(
        project.softwareName, project.version, "软件著作权人", manualMarkdown
      );

      // Step 5: Done
      setStepIndex(5); setCurrentStep("生成完成！"); setProgress(100);
      updateProject(projectId, { status: "DONE", meta: { ...meta, sourceLines: totalSourceLines } });
      setProject(getProject(projectId)!);
      setCodePdfUrl(URL.createObjectURL(codePDFBlob));
      setManualPdfUrl(URL.createObjectURL(manualPDFBlob));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      setError(msg);
      updateProject(projectId, { status: "FAILED", errorMsg: msg });
      setProject(getProject(projectId)!);
    } finally {
      setGenerating(false);
    }
  }, [project, projectId, accessToken, meta]);

  const handleDownload = (url: string | null, filename: string) => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  };

  if (!project || !meta) {
    return <div className="flex items-center justify-center min-h-screen"><div className="spinner w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" /></div>;
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{project.softwareName}</h1>
          <p className="text-sm text-[var(--color-muted)]">{project.repoOwner}/{project.repoName} · {project.version}</p>
        </div>

        {/* Metadata display/edit */}
        {project.status === "PENDING" && !generating && (
          <div className="space-y-6">
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
              <h2 className="text-base font-semibold mb-4">软件信息（自动生成，可编辑）</h2>
              {!metaReady && <p className="text-xs text-[var(--color-primary)] mb-4">正在自动检测和生成元数据...</p>}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <MetaField label="软件分类" value={meta.category} />
                <MetaField label="编程语言" value={meta.languagesGiven.join(", ") || "检测中..."} />
                <MetaField label="源程序行数" value={meta.sourceLines ? `${meta.sourceLines} 行` : "统计中..."} />
                <MetaField label="开发工具" value={meta.devTools || "检测中..."} />
                <MetaField label="开发硬件环境" value={meta.devHardware || "检测中..."} />
                <MetaField label="运行硬件环境" value={meta.runHardware || "检测中..."} />
                <MetaField label="开发操作系统" value={meta.devOS || "检测中..."} />
                <MetaField label="运行平台" value={meta.runPlatform || "AI 生成中..."} />
                <MetaField label="运行支撑环境" value={meta.runSupport || "AI 生成中..."} />
                <MetaField label="面向领域" value={meta.domain || "AI 生成中..."} />
              </div>
              <div className="mt-4 space-y-3">
                <EditableField label="开发目的" value={meta.purpose} onChange={(v) => setMeta({ ...meta, purpose: v })} placeholder="AI 生成中..." />
                <EditableField label="主要功能" value={meta.mainFeatures} onChange={(v) => setMeta({ ...meta, mainFeatures: v })} placeholder="AI 生成中..." />
                <EditableField label="技术特点" value={meta.technicalFeatures} onChange={(v) => setMeta({ ...meta, technicalFeatures: v })} placeholder="AI 生成中..." />
              </div>
            </div>

            <button onClick={startGenerate} disabled={!metaReady}
              className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {metaReady ? "确认信息并开始生成" : "正在检测元数据..."}
            </button>
          </div>
        )}

        {/* Progress */}
        {(project.status === "PROCESSING" || generating) && (
          <div className="py-8">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[var(--color-muted)]">{currentStep}</span>
                <span className="text-sm font-medium">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-primary)] transition-all duration-500 ease-out rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="space-y-3">
              {steps.map((step, i) => {
                const isDone = i < stepIndex || (i === stepIndex && progress >= 100);
                const isCurrent = i === stepIndex && progress < 100;
                return (
                  <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-lg ${isCurrent ? "bg-[var(--color-primary)]/10" : ""}`}>
                    {isDone ? (
                      <svg className="w-5 h-5 text-[var(--color-success)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : isCurrent ? (
                      <div className="spinner w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 border-2 border-[var(--color-border)] rounded-full flex-shrink-0" />
                    )}
                    <span className={`text-sm ${i > stepIndex ? "text-[var(--color-muted)]" : isCurrent ? "text-[var(--color-foreground)] font-medium" : "text-[var(--color-muted-foreground)]"}`}>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Done */}
        {project.status === "DONE" && meta && (
          <div className="py-6 space-y-6">
            <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-lg font-semibold text-[var(--color-success)]">材料生成完成！请复制以下信息到版权局登记系统</span>
              </div>
            </div>

            {/* Download */}
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleDownload(codePdfUrl, `${project.softwareName}_程序鉴别材料.pdf`)}
                className="py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors text-center">
                下载程序鉴别材料
              </button>
              <button onClick={() => handleDownload(manualPdfUrl, `${project.softwareName}_文档鉴别材料.pdf`)}
                className="py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors text-center">
                下载文档鉴别材料
              </button>
            </div>
            <button onClick={() => { updateProject(projectId, { status: "PENDING" }); setProject(getProject(projectId)!); setMetaReady(false); setCodePdfUrl(null); setManualPdfUrl(null); }}
                className="px-6 py-3 border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:border-[var(--color-muted)] transition-colors">重新生成</button>

            {/* Registration form reference */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6">
              <h2 className="text-base font-semibold mb-4">软件著作权登记 — 填表参考</h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">以下信息可直接复制粘贴到中国版权保护中心登记系统</p>

              <div className="space-y-4">
                <CopyField label="软件全称" value={project.softwareName} />
                <CopyField label="版本号" value={project.version} />
                <CopyField label="软件分类" value={meta.category} />
                <CopyField label="软件说明" value={meta.softwareDescription || meta.purpose || "-"} />
                <CopyField label="原创修改" value={meta.originalType} hint="含翻译软件、合成软件" />
                <CopyField label="开发方式" value={meta.devMethod} hint="单独开发/合作开发/委托开发/下达任务开发" />
                <CopyField label="开发完成日期" value={project.completedAt || "-"} />
                <CopyField label="发表状态" value={meta.publishStatus} />
                <CopyField label="开发的硬件环境" value={meta.devHardware} />
                <CopyField label="运行的硬件环境" value={meta.runHardware} />
                <CopyField label="开发该软件的操作系统" value={meta.devOS} />
                <CopyField label="软件开发环境 / 开发工具" value={meta.devTools} />
                <CopyField label="该软件的运行平台 / 操作系统" value={meta.runPlatform} />
                <CopyField label="软件运行支撑环境 / 支持软件" value={meta.runSupport} />
                <CopyField label="编程语言（给定项）" value={meta.languagesGiven.join("、") || "无"} />
                <CopyField label="编程语言（补充项）" value={meta.languagesExtra.join("、") || "无"} />
                <CopyField label="源程序量" value={`${meta.sourceLines} 行`} />
                <CopyField label="开发目的" value={meta.purpose} />
                <CopyField label="面向领域 / 行业" value={meta.domain} />
                <CopyField label="软件的主要功能" value={meta.mainFeatures} />
                <CopyField label="技术特点分类（给定项）" value={meta.techCategoriesGiven.join("、") || "无"} />
                <CopyField label="技术特点（补充说明）" value={meta.techCategoriesExtra.join("、") || meta.technicalFeatures} />
              </div>
            </div>

            {/* Upload guidance */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6">
              <h2 className="text-base font-semibold mb-4">鉴别材料上传指引</h2>
              <div className="space-y-4 text-sm">
                <UploadGuide
                  title="程序鉴别材料"
                  desc="一般交存：源程序前连续的30页和后连续的30页"
                  file="程序鉴别材料.pdf"
                  format="PDF"
                  onDownload={() => handleDownload(codePdfUrl, `${project.softwareName}_程序鉴别材料.pdf`)}
                />
                <UploadGuide
                  title="文档鉴别材料"
                  desc="一般交存：提交任何一种文档的前连续的30页和后连续的30页"
                  file="文档鉴别材料.pdf"
                  format="PDF"
                  onDownload={() => handleDownload(manualPdfUrl, `${project.softwareName}_文档鉴别材料.pdf`)}
                />
                <div className="border border-[var(--color-border)] rounded-lg p-4 opacity-60">
                  <div className="font-medium mb-1">其他相关证明文件</div>
                  <p className="text-xs text-[var(--color-muted)]">如无特殊要求，此项无需上传，直接跳过即可。</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Failed */}
        {project.status === "FAILED" && (
          <div className="py-8">
            <div className="bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                <span className="text-lg font-semibold text-[var(--color-error)]">生成失败</span>
              </div>
              <p className="text-sm text-[var(--color-muted)]">{project.errorMsg || error || "未知错误，请重试。"}</p>
            </div>
            <button onClick={startGenerate} className="px-6 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors">重新生成</button>
          </div>
        )}
      </main>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)] mb-1">{label}</div>
      <div className="text-sm">{value || <span className="text-[var(--color-muted)]">-</span>}</div>
    </div>
  );
}

function EditableField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] resize-none" />
    </div>
  );
}

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
      <div className="w-48 flex-shrink-0 text-sm text-[var(--color-muted)] pt-0.5">{label}</div>
      <div className="flex-1 text-sm min-w-0">
        <div className="break-words">{value || <span className="text-[var(--color-muted)]">-</span>}</div>
        {hint && <div className="text-xs text-[var(--color-muted)] mt-0.5">{hint}</div>}
      </div>
      <button onClick={handleCopy}
        className="flex-shrink-0 px-2 py-1 text-xs border border-[var(--color-border)] rounded text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:border-[var(--color-muted)] transition-colors">
        {copied ? "已复制" : "复制"}
      </button>
    </div>
  );
}

function UploadGuide({ title, desc, file, format, onDownload }: { title: string; desc: string; file: string; format: string; onDownload?: () => void }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4">
      <div className="font-medium mb-1">{title}</div>
      <p className="text-xs text-[var(--color-muted)] mb-2">{desc}，请上传{format}格式。</p>
      <div className="flex items-center gap-3 text-sm">
        <svg className="w-4 h-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        <span className="text-[var(--color-success)]">{file}</span>
        {onDownload && (
          <button onClick={onDownload} className="text-xs text-[var(--color-primary)] hover:underline">下载</button>
        )}
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  return <SessionProvider><ProjectDetailContent /></SessionProvider>;
}
