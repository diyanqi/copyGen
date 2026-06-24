"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { getAIKey, setAIKey, getAIProtocol, setAIProtocol, getAIBaseUrl, setAIBaseUrl, getAIModel, setAIModel, AI_DEFAULTS, type AIProtocol, hasAgreed, setAgreed } from "@/lib/storage";

function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="10" fill="#2563eb"/>
      <path d="M14 12h20v3H17v9h14v3H17v9h17v3H14V12z" fill="white"/>
      <circle cx="34" cy="34" r="8" fill="#22c55e" opacity="0.9"/>
      <path d="M31 34l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const AGREEMENT_TEXT = `软著通 用户服务协议

欢迎使用软著通（以下简称"本工具"）。在使用本工具前，请您仔细阅读并充分理解以下条款。使用本工具即表示您同意遵守本协议的所有条款。

一、服务说明
本工具是一个辅助性质的软件著作权申报材料生成工具，旨在帮助开发者提高材料准备效率。本工具生成的所有材料仅供参考，用户应自行核实内容的准确性、完整性和合法性，并对最终提交材料承担全部法律责任。

二、用户义务与承诺
1. 合法使用：您承诺仅将本工具用于合法目的，不得利用本工具从事任何违反中华人民共和国法律法规的活动，包括但不限于《中华人民共和国著作权法》《计算机软件保护条例》《中华人民共和国网络安全法》等相关法律法规。
2. 如实申报：您承诺使用本工具生成的软件著作权登记材料内容真实、准确，不存在虚假记载、误导性陈述或重大遗漏。您理解并确认，提交虚假材料骗取软件著作权登记将承担相应的法律责任。
3. 知识产权尊重：您承诺所申报的软件系您合法拥有或经授权的原创作品，不存在侵犯他人知识产权的情形。
4. AI 使用规范：您理解本工具使用人工智能技术辅助生成文档内容，AI 生成的内容可能存在不准确之处。您有义务对 AI 生成的内容进行审核、修改和完善，确保最终材料符合实际情况和法律要求。您不得利用本工具的 AI 功能生成虚假、误导性或违法违规内容。

三、数据安全与隐私
1. 本工具采用纯前端架构，您的代码和生成的文档仅在浏览器本地处理，不会上传至任何第三方服务器（AI API 调用除外）。
2. 您的 GitHub Token、API Key 等敏感信息仅存储在浏览器本地 localStorage 中，本工具不会收集、存储或传输这些信息。
3. AI 生成过程中，部分代码摘要和仓库信息会发送至您配置的 AI 服务提供商，您应了解并接受相关服务提供商的数据处理政策。

四、免责声明
1. 本工具按"现状"提供服务，不保证生成材料能够成功通过软件著作权登记审核。
2. 本工具生成的材料不构成法律建议，用户在提交前应咨询专业人士。
3. 因用户使用本工具产生的任何法律纠纷或损失，本工具开发者不承担任何责任。
4. 本工具依赖第三方服务（GitHub API、AI API），因第三方服务中断或变更导致的功能异常，本工具开发者不承担责任。

五、协议变更
本工具保留随时修改本协议的权利，修改后的协议将在本工具中公布。继续使用本工具即视为您接受修改后的协议。

六、适用法律
本协议适用中华人民共和国法律，因本协议引起的争议应协商解决，协商不成的，提交本工具开发者所在地人民法院管辖。`;

function LandingContent() {
  const { data: session } = useSession();
  const [showSettings, setShowSettings] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [agreed, setAgreedState] = useState(hasAgreed());
  const [agreedChecked, setAgreedChecked] = useState(false);
  const [aiProtocol, setAiProtocolState] = useState<AIProtocol>(getAIProtocol());
  const [aiKey, setAiKeyState] = useState(getAIKey() || "");
  const [aiBaseUrl, setAiBaseUrlState] = useState(getAIBaseUrl());
  const [aiModel, setAiModelState] = useState(getAIModel());
  const hasAiKey = !!getAIKey();
  const defaults = AI_DEFAULTS[aiProtocol];

  const handleProtocolChange = (p: AIProtocol) => {
    setAiProtocolState(p);
    setAiBaseUrlState(AI_DEFAULTS[p].baseUrl);
    setAiModelState(AI_DEFAULTS[p].model);
  };

  const saveSettings = () => {
    setAIProtocol(aiProtocol);
    setAIKey(aiKey.trim());
    setAIBaseUrl(aiBaseUrl.trim() || defaults.baseUrl);
    setAIModel(aiModel.trim() || defaults.model);
    setShowSettings(false);
  };

  const handleAgree = () => {
    setAgreed();
    setAgreedState(true);
    setShowAgreement(false);
  };

  const handleMainAction = () => {
    if (!agreed) { setShowAgreement(true); return; }
    if (!hasAiKey) { setShowSettings(true); return; }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-[var(--color-border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold">软著通</span>
          </div>
          <nav className="flex items-center gap-4">
            <a href="https://github.com/diyanqi/copyGen" target="_blank" rel="noopener noreferrer"
              className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </a>
            {session && (
              <button onClick={() => setShowSettings(true)} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">设置</button>
            )}
            {session ? (
              <div className="flex items-center gap-3">
                {session.user?.image && <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />}
                <span className="text-sm text-[var(--color-muted)]">{session.user?.name}</span>
                <button onClick={() => signOut()} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">退出</button>
              </div>
            ) : (
              <button onClick={() => signIn("github")} className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition-colors">
                用 GitHub 登录
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 py-24 text-center">
          <div className="flex items-center justify-center mb-6">
            <Logo size={64} />
          </div>
          <div className="inline-block px-3 py-1 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-xs font-medium mb-6">
            符合国家版权局规范
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6" style={{ backgroundImage: "linear-gradient(to bottom, var(--color-hero-from), var(--color-hero-to))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            一键生成软著申报材料
          </h1>
          <p className="text-lg text-[var(--color-muted)] max-w-2xl mx-auto mb-4">
            选择你的 GitHub 仓库，AI 自动生成符合国家版权局规范的源程序代码文档和软件说明书，打包下载即可提交申报。
          </p>
          <p className="text-sm text-[var(--color-muted)] max-w-2xl mx-auto mb-10">
            所有数据仅在浏览器本地处理，代码不会上传至任何服务器。
          </p>
          {session && hasAiKey && agreed ? (
            <Link href="/dashboard" className="inline-block px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors text-base">
              进入控制台
            </Link>
          ) : session ? (
            <button onClick={handleMainAction} className="inline-block px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors text-base">
              配置 API Key 开始使用
            </button>
          ) : (
            <button onClick={() => signIn("github")} className="inline-flex items-center gap-2 px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 transition-colors text-base">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              用 GitHub 登录
            </button>
          )}
        </section>

        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z", title: "1. 选择仓库", desc: "从你的 GitHub 仓库列表中选择需要申请软著的项目，填写软件基本信息。" },
              { icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", title: "2. AI 生成", desc: "AI 自动分析代码结构，生成符合规范的源程序代码文档和软件操作说明书。" },
              { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "3. 下载材料", desc: "一键下载打包好的 ZIP 文件，包含 PDF 格式的程序鉴别材料和文档鉴别材料。" },
            ].map((item) => (
              <div key={item.title} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6">
                <div className="w-10 h-10 bg-[var(--color-primary)]/10 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-[var(--color-muted)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] py-6 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-[var(--color-muted)]">
          <span>软著通 - 纯本地处理，保护你的代码隐私</span>
          <a href="https://github.com/diyanqi/copyGen" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-foreground)] transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
      </footer>

      {/* User Agreement Modal */}
      {showAgreement && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowAgreement(false)}>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold">用户服务协议</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-[var(--color-foreground)]">{AGREEMENT_TEXT}</pre>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={agreedChecked} onChange={(e) => setAgreedChecked(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-zinc-600 accent-[var(--color-primary)]" />
                <span className="text-sm">我已阅读并同意上述用户服务协议，承诺合法合规使用本工具，对生成材料的真实性和合法性承担全部责任。</span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => setShowAgreement(false)}
                  className="flex-1 py-2 border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">取消</button>
                <button onClick={handleAgree} disabled={!agreedChecked}
                  className="flex-1 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  同意并继续
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">配置 AI</h2>
            <p className="text-xs text-[var(--color-muted)] mb-4">所有配置仅存储在浏览器本地，不会上传至任何服务器。</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-1">协议</label>
                <select value={aiProtocol} onChange={(e) => handleProtocolChange(e.target.value as AIProtocol)}
                  className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]">
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-1">API Key</label>
                <input type="password" value={aiKey} onChange={(e) => setAiKeyState(e.target.value)} placeholder={defaults.keyPlaceholder}
                  className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-1">Base URL</label>
                <input type="text" value={aiBaseUrl} onChange={(e) => setAiBaseUrlState(e.target.value)} placeholder={defaults.baseUrl}
                  className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
                <p className="text-xs text-[var(--color-muted)] mt-1">支持自定义域名或代理地址</p>
              </div>
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-1">模型</label>
                <input type="text" value={aiModel} onChange={(e) => setAiModelState(e.target.value)} placeholder={defaults.model}
                  className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <button onClick={saveSettings} disabled={!aiKey.trim()}
                className="w-full py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  return <SessionProvider><LandingContent /></SessionProvider>;
}
