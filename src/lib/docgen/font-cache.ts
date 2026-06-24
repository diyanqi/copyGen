// Font loading cache — load Google Fonts CSS once, reuse for all iframes

let fontCSSCache: string | null = null;
let fontLoadPromise: Promise<string> | null = null;

const NOTO_SANS_SC_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;700&family=Noto+Sans+Mono:wght@400&display=swap";

export async function getFontCSS(): Promise<string> {
  if (fontCSSCache) return fontCSSCache;
  if (fontLoadPromise) return fontLoadPromise;

  fontLoadPromise = fetch(NOTO_SANS_SC_URL)
    .then((r) => r.text())
    .then((css) => {
      // Convert relative urls to absolute
      fontCSSCache = css.replace(/url\(\//g, "url(https://fonts.gstatic.com/");
      return fontCSSCache;
    })
    .catch(() => {
      fontCSSCache = "";
      return "";
    });

  return fontLoadPromise;
}

export function injectFontsIntoHTML(html: string, fontCSS: string): string {
  if (!fontCSS) return html;
  // Inject font CSS as a <style> tag instead of @import (avoids repeated network requests)
  return html.replace("</head>", `<style>${fontCSS}</style></head>`);
}
