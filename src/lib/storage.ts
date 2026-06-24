export type AIProtocol = "openai" | "claude" | "gemini";

const STORAGE_KEYS = {
  AI_PROTOCOL: "ruanzhu_ai_protocol",
  AI_KEY: "ruanzhu_ai_key",
  AI_BASE_URL: "ruanzhu_ai_base_url",
  AI_MODEL: "ruanzhu_ai_model",
  ANTHROPIC_KEY: "ruanzhu_anthropic_key",
  ANTHROPIC_BASE_URL: "ruanzhu_anthropic_base_url",
  ANTHROPIC_MODEL: "ruanzhu_anthropic_model",
  PROJECTS: "ruanzhu_projects",
  AGREED: "ruanzhu_agreed",
};

export const AI_DEFAULTS: Record<AIProtocol, { baseUrl: string; model: string; keyPlaceholder: string; label: string }> = {
  openai: { baseUrl: "https://api.openai.com", model: "gpt-4o", keyPlaceholder: "sk-xxxx", label: "OpenAI" },
  claude: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-6", keyPlaceholder: "sk-ant-xxxx", label: "Claude" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-2.0-flash", keyPlaceholder: "AIzaSy-xxxx", label: "Gemini" },
};

function migrateIfNeeded() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEYS.AI_KEY)) return;
  const oldKey = localStorage.getItem(STORAGE_KEYS.ANTHROPIC_KEY);
  if (!oldKey) return;
  localStorage.setItem(STORAGE_KEYS.AI_PROTOCOL, "claude");
  localStorage.setItem(STORAGE_KEYS.AI_KEY, oldKey);
  localStorage.setItem(STORAGE_KEYS.AI_BASE_URL, localStorage.getItem(STORAGE_KEYS.ANTHROPIC_BASE_URL) || AI_DEFAULTS.claude.baseUrl);
  localStorage.setItem(STORAGE_KEYS.AI_MODEL, localStorage.getItem(STORAGE_KEYS.ANTHROPIC_MODEL) || AI_DEFAULTS.claude.model);
}

export function getAIProtocol(): AIProtocol {
  if (typeof window === "undefined") return "openai";
  migrateIfNeeded();
  const v = localStorage.getItem(STORAGE_KEYS.AI_PROTOCOL);
  if (v === "openai" || v === "claude" || v === "gemini") return v;
  return "openai";
}

export function setAIProtocol(protocol: AIProtocol) {
  localStorage.setItem(STORAGE_KEYS.AI_PROTOCOL, protocol);
}

export function getAIKey(): string | null {
  if (typeof window === "undefined") return null;
  migrateIfNeeded();
  return localStorage.getItem(STORAGE_KEYS.AI_KEY);
}

export function setAIKey(key: string) {
  localStorage.setItem(STORAGE_KEYS.AI_KEY, key);
}

export function getAIBaseUrl(): string {
  if (typeof window === "undefined") return AI_DEFAULTS.openai.baseUrl;
  migrateIfNeeded();
  return localStorage.getItem(STORAGE_KEYS.AI_BASE_URL) || AI_DEFAULTS[getAIProtocol()].baseUrl;
}

export function setAIBaseUrl(url: string) {
  localStorage.setItem(STORAGE_KEYS.AI_BASE_URL, url.replace(/\/+$/, ""));
}

export function getAIModel(): string {
  if (typeof window === "undefined") return AI_DEFAULTS.openai.model;
  migrateIfNeeded();
  return localStorage.getItem(STORAGE_KEYS.AI_MODEL) || AI_DEFAULTS[getAIProtocol()].model;
}

export function setAIModel(model: string) {
  localStorage.setItem(STORAGE_KEYS.AI_MODEL, model);
}

// ── User agreement ──

export function hasAgreed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEYS.AGREED) === "true";
}

export function setAgreed() {
  localStorage.setItem(STORAGE_KEYS.AGREED, "true");
}

// ── Software metadata ──

export interface SoftwareMeta {
  devHardware: string;
  runHardware: string;
  devOS: string;
  devTools: string;
  runPlatform: string;
  runSupport: string;
  category: string;
  sourceLines: number;
  purpose: string;
  domain: string;
  mainFeatures: string;
  technicalFeatures: string;
  languagesGiven: string[];
  languagesExtra: string[];
  techCategoriesGiven: string[];
  techCategoriesExtra: string[];
  softwareDescription: string;
  originalType: string;
  devMethod: string;
  publishStatus: string;
}

export function createEmptyMeta(): SoftwareMeta {
  return {
    devHardware: "", runHardware: "", devOS: "", devTools: "",
    runPlatform: "", runSupport: "", category: "应用软件", sourceLines: 0,
    purpose: "", domain: "", mainFeatures: "", technicalFeatures: "",
    languagesGiven: [], languagesExtra: [],
    techCategoriesGiven: [], techCategoriesExtra: [],
    softwareDescription: "", originalType: "原创", devMethod: "单独开发", publishStatus: "未发表",
  };
}

// ── Project data ──

export interface Project {
  id: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  softwareName: string;
  version: string;
  completedAt?: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  meta: SoftwareMeta;
  errorMsg?: string;
  createdAt: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getProjects(): Project[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function getProject(id: string): Project | undefined {
  return getProjects().find((p) => p.id === id);
}

export function createProject(data: Omit<Project, "id" | "status" | "createdAt">): Project {
  const project: Project = { ...data, id: generateId(), status: "PENDING", createdAt: new Date().toISOString() };
  const projects = getProjects();
  projects.unshift(project);
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  return project;
}

export function updateProject(id: string, updates: Partial<Project>) {
  const projects = getProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx >= 0) {
    projects[idx] = { ...projects[idx], ...updates };
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  }
}

export function deleteProject(id: string) {
  const projects = getProjects().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
}

export function deleteProjects(ids: string[]) {
  const idSet = new Set(ids);
  const projects = getProjects().filter((p) => !idSet.has(p.id));
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
}
