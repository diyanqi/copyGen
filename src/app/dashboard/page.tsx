"use client";
import Logo from "@/components/Logo";


import Image from "next/image";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { getProjects, getAIKey, deleteProject, deleteProjects, type Project } from "@/lib/storage";

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待处理", color: "bg-zinc-500/20 text-zinc-400" },
  PROCESSING: { label: "生成中", color: "bg-blue-500/20 text-blue-400" },
  DONE: { label: "已完成", color: "bg-green-500/20 text-green-400" },
  FAILED: { label: "失败", color: "bg-red-500/20 text-red-400" },
};

type SortKey = "createdAt" | "softwareName" | "status";

const statusOrder: Record<string, number> = { PROCESSING: 0, PENDING: 1, FAILED: 2, DONE: 3 };

function SortIndicator({ active, ascending }: { active: boolean; ascending: boolean }) {
  if (!active) return null;
  return <span className="ml-1 text-xs">{ascending ? "↑" : "↓"}</span>;
}

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (session && !getAIKey()) router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const refreshProjects = async () => {
      await Promise.resolve();
      if (active) setProjects(getProjects());
    };
    void refreshProjects();
    return () => { active = false; };
  }, [session]);

  const filtered = useMemo(() => {
    let list = projects;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.softwareName.toLowerCase().includes(q) ||
        `${p.repoOwner}/${p.repoName}`.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortKey === "softwareName") cmp = a.softwareName.localeCompare(b.softwareName, "zh");
      else if (sortKey === "status") cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [projects, search, sortKey, sortAsc]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const handleDelete = (id: string) => {
    deleteProject(id);
    setProjects(getProjects());
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setConfirmDelete(null);
  };

  const handleBulkDelete = () => {
    deleteProjects(Array.from(selected));
    setProjects(getProjects());
    setSelected(new Set());
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "softwareName"); }
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {session.user?.image && <Image src={session.user.image} alt="" width={28} height={28} unoptimized className="rounded-full" />}
              <span className="text-sm text-[var(--color-muted)]">{session.user?.name}</span>
            </div>
            <button onClick={() => signOut()} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">退出</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">我的项目</h1>
          <Link href="/projects/new" className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition-colors">
            新建项目
          </Link>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <input type="text" placeholder="搜索项目..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />

          <select value={sortKey} onChange={(e) => handleSort(e.target.value as SortKey)}
            className="px-3 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]">
            <option value="createdAt">按时间</option>
            <option value="softwareName">按名称</option>
            <option value="status">按状态</option>
          </select>
          <button onClick={() => setSortAsc(!sortAsc)}
            className="px-2 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">
            {sortAsc ? "↑" : "↓"}
          </button>

          {selected.size > 0 && (
            <button onClick={handleBulkDelete}
              className="px-3 py-2 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded-lg text-sm text-[var(--color-error)] hover:bg-[var(--color-error)]/20 transition-colors">
              删除 ({selected.size})
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-[var(--color-muted)] mb-4">{search ? "没有匹配的项目" : "还没有项目"}</div>
            {!search && (
              <Link href="/projects/new" className="inline-block px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition-colors">
                创建第一个项目
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid items-center gap-4 px-5 py-3 border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]"
              style={{ gridTemplateColumns: "28px 1fr 160px 100px 120px 80px" }}>
              <label className="flex items-center justify-center cursor-pointer">
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-[var(--color-border)] bg-[var(--color-input-bg)] accent-[var(--color-primary)]" />
              </label>
              <button onClick={() => handleSort("softwareName")} className="text-left hover:text-[var(--color-foreground)] transition-colors">
                项目名称<SortIndicator active={sortKey === "softwareName"} ascending={sortAsc} />
              </button>
              <button onClick={() => handleSort("status")} className="text-left hover:text-[var(--color-foreground)] transition-colors">
                状态<SortIndicator active={sortKey === "status"} ascending={sortAsc} />
              </button>
              <span>仓库</span>
              <button onClick={() => handleSort("createdAt")} className="text-left hover:text-[var(--color-foreground)] transition-colors">
                创建时间<SortIndicator active={sortKey === "createdAt"} ascending={sortAsc} />
              </button>
              <span className="text-center">操作</span>
            </div>

            {/* Table rows */}
            {filtered.map((project) => (
              <div key={project.id}
                className="grid items-center gap-4 px-5 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-white/[0.02] transition-colors"
                style={{ gridTemplateColumns: "28px 1fr 160px 100px 120px 80px" }}>
                <label className="flex items-center justify-center cursor-pointer">
                  <input type="checkbox" checked={selected.has(project.id)} onChange={() => toggleSelect(project.id)}
                    className="w-4 h-4 rounded border-[var(--color-border)] bg-[var(--color-input-bg)] accent-[var(--color-primary)]" />
                </label>
                <Link href={`/projects/${project.id}`} className="font-medium hover:text-[var(--color-primary)] transition-colors truncate">
                  {project.softwareName}
                </Link>
                <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${statusConfig[project.status]?.color || ""}`}>
                  {statusConfig[project.status]?.label || project.status}
                </span>
                <span className="text-sm text-[var(--color-muted)] truncate">
                  {project.repoOwner}/{project.repoName}
                </span>
                <span className="text-sm text-[var(--color-muted)]">
                  {new Date(project.createdAt).toLocaleDateString("zh-CN")}
                </span>
                <div className="flex items-center justify-center gap-1">
                  <Link href={`/projects/${project.id}`}
                    className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-border)] transition-colors" title="查看">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </Link>
                  {confirmDelete === project.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(project.id)}
                        className="px-2 py-1 text-xs bg-[var(--color-error)] text-white rounded transition-colors">确认</button>
                      <button onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 text-xs border border-[var(--color-border)] rounded text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(project.id)}
                      className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-border)] transition-colors" title="删除">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <SessionProvider>
      <DashboardContent />
    </SessionProvider>
  );
}
