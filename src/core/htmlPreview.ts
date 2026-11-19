// The static preview of an html code block of an answer (opened in an editor tab of its own, never in the chat feed).
// Pure text building, so it is unit tested; the webview itself is src/htmlPreview.ts.

/** No scripts, no network, no frames, no forms, no <base>: styles in the page and data: pictures only. */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'";
/** Longest html taken for a preview (characters). */
export const MAX_PREVIEW = 500_000;

/** A complete document: our CSP first, a light default page, then the block as it is (a full document or a fragment both work). */
export function previewDocument(html: string): string {
  const body = html.length > MAX_PREVIEW ? html.slice(0, MAX_PREVIEW) : html;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { background: #fff; color: #1b1f24; font-family: system-ui, sans-serif; margin: 12px; }</style>
</head>
<body>
${body}
</body>
</html>`;
}
