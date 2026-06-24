import { getFontCSS, injectFontsIntoHTML } from "@/lib/docgen/font-cache";

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function markdownToHTML(markdown: string): string {
  const lines = markdown.split("\n");
  let html = "";
  let inCodeBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) { inCodeBlock = !inCodeBlock; html += inCodeBlock ? '<pre style="font-family:monospace;font-size:9pt;background:#f5f5f5;padding:6pt;margin:6pt 0;white-space:pre-wrap">' : "</pre>"; continue; }
    if (inCodeBlock) { html += escapeHTML(trimmed) + "\n"; continue; }
    if (/^#\s+/.test(trimmed) && !/^##\s+/.test(trimmed)) { html += `<h1>${escapeHTML(trimmed.replace(/^#\s+/, ""))}</h1>`; continue; }
    if (/^##\s+/.test(trimmed)) { html += `<h2>${escapeHTML(trimmed.replace(/^##\s+/, ""))}</h2>`; continue; }
    if (/^\[图[\d-]+[：:]/.test(trimmed)) { html += `<div style="text-align:center;margin:12pt 0;padding:16pt;border:1px solid #999;color:#999;font-style:italic">${escapeHTML(trimmed)}</div>`; continue; }
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/\*{1,2}([^*]+)\*{1,2}/g, "<strong>$1</strong>").replace(/_{1,2}([^_]+)_{1,2}/g, "<em>$1</em>");
    html += `<p>${cleaned}</p>`;
  }
  return html;
}

const LINES_PER_PAGE = 30;

async function renderToPDF(pagesHTML: string[], headerText: string): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");
  const fontCSS = await getFontCSS();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let i = 0; i < pagesHTML.length; i++) {
    if (i > 0) doc.addPage();

    let pageHTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans SC',sans-serif;font-size:10.5pt;line-height:20pt;color:#000;width:794px;padding:80px 90px}
h1{font-size:14pt;font-weight:bold;margin:24pt 0 12pt}
h2{font-size:12pt;font-weight:bold;margin:12pt 0 6pt}
p{text-indent:2em;margin:4pt 0}
.header{display:flex;justify-content:space-between;font-size:9pt;margin-bottom:6pt;border-bottom:0.5pt solid #000;padding-bottom:6pt}
</style></head><body>
<div class="header"><span>${escapeHTML(headerText)}</span><span>第 ${i + 1} 页</span></div>
${pagesHTML[i]}
</body></html>`;

    pageHTML = injectFontsIntoHTML(pageHTML, fontCSS);

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:0;top:0;width:794px;height:1123px;opacity:0;pointer-events:none;z-index:-9999";
    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(pageHTML);
      iframeDoc.close();

      await iframe.contentWindow!.document.fonts.ready;
      await new Promise((r) => setTimeout(r, 150));

      const canvas = await html2canvas(iframeDoc.body, {
        scale: 1, useCORS: true, allowTaint: true, logging: false,
        width: 794, height: 1123, windowWidth: 794, windowHeight: 1123,
      });
      doc.addImage(canvas.toDataURL("image/jpeg", 0.7), "JPEG", 0, 0, 210, 297);
    } finally {
      document.body.removeChild(iframe);
    }
  }

  return doc.output("blob");
}

export async function generateManualPDF(
  softwareName: string, version: string, _developerName: string, markdown: string
): Promise<Blob> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  const chapters = (markdown || "").split("\n").filter((l) => /^#\s+/.test(l.trim()) && !/^##\s+/.test(l.trim()));
  const bodyHTML = markdownToHTML(markdown || "");

  const coverHTML = `<div style="text-align:center;padding-top:200pt">
    <h1 style="font-size:22pt;margin-bottom:16pt">${escapeHTML(softwareName)}</h1>
    <div style="font-size:16pt;margin-bottom:12pt">操作说明书</div>
    <div style="font-size:12pt;margin-bottom:8pt;color:#333">${escapeHTML(version)}</div>
    <div style="font-size:12pt;color:#333">${dateStr}</div>
  </div>`;

  const tocItems = chapters.map((l) => `<p style="text-indent:0;font-size:11pt;margin-bottom:8pt">${escapeHTML(l.replace(/^#\s+/, "").trim())}</p>`).join("");
  const tocHTML = `<h2 style="text-align:center;font-size:14pt;margin-bottom:24pt">目  录</h2>${tocItems}`;

  const paragraphs = bodyHTML.split(/(?=<h[12]|<p|<div|<pre)/).filter((p) => p.trim());
  const pages: string[] = [tocHTML];
  let currentPage = "";
  let lineCount = 0;

  for (const para of paragraphs) {
    if (lineCount >= LINES_PER_PAGE) { pages.push(currentPage); currentPage = ""; lineCount = 0; }
    currentPage += para;
    lineCount += 2;
  }
  if (currentPage.trim()) pages.push(currentPage);

  // Pad to 33-45 pages (cover + toc + body + padding)
  const MIN_PAGES = 34; // 1 cover + 33 content pages minimum
  while (pages.length < MIN_PAGES) pages.push("<p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>");
  pages.unshift(coverHTML);

  return renderToPDF(pages, `${softwareName} ${version}`);
}
