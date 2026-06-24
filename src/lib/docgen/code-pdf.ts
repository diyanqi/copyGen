import { selectCodeLines } from "@/lib/utils";
import { getFontCSS, injectFontsIntoHTML } from "@/lib/docgen/font-cache";

const LINES_PER_PAGE = 50;

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function compressLines(lines: string[]): string[] {
  const result: string[] = [];
  let emptyCount = 0;
  for (const line of lines) {
    if (line.trim() === "") { emptyCount++; if (emptyCount <= 2) result.push(line); }
    else { emptyCount = 0; result.push(line); }
  }
  return result;
}

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
body{font-family:'Noto Sans SC','Noto Sans Mono','Courier New',sans-serif;font-size:10pt;line-height:16pt;color:#000;width:794px;padding:80px 90px}
.code-line{white-space:pre-wrap;word-break:break-all;min-height:16pt;font-family:'Noto Sans Mono','Courier New',monospace;font-size:9pt;line-height:14pt}
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

export async function generateCodePDF(
  softwareName: string, version: string,
  codeFiles: { path: string; content: string }[]
): Promise<Blob> {
  const allLines: string[] = [];
  for (const file of codeFiles) {
    allLines.push(`// ========== 文件路径：${file.path} ==========`);
    allLines.push(...file.content.split("\n"));
    allLines.push("");
  }

  const selectedLines = selectCodeLines(allLines);
  const compressed = compressLines(selectedLines);

  const pages: string[] = [];
  for (let i = 0; i < compressed.length; i += LINES_PER_PAGE) {
    const pageLines = compressed.slice(i, i + LINES_PER_PAGE);
    pages.push(pageLines.map((l) => `<div class="code-line">${escapeHTML(l) || " "}</div>`).join(""));
  }

  return renderToPDF(pages, `${softwareName} ${version}`);
}
