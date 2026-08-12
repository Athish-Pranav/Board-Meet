"use server";

import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";

/**
 * Convert a Word (.docx) buffer to styled HTML.
 */
export async function docxToHtml(buf: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer: buf });
  return wrapHtml("Word Document", result.value);
}

/**
 * Convert an Excel (.xlsx / .xls) buffer to an HTML table.
 *
 * `xlsx` has known, currently-unpatched advisories (prototype pollution,
 * ReDoS) in its formula-parsing path — see GHSA-4r6h-8v6p-xvw6 and
 * GHSA-5pgg-2g8v-p4x9. We only ever render cell values, never formula text,
 * so `cellFormula: false` skips that code path entirely; the route calling
 * this also caps input size (see the preview route) to shrink the remaining
 * surface. This reduces but does not eliminate the risk — a maintained
 * replacement or real process isolation is the full fix, tracked separately.
 */
export async function xlsxToHtml(buf: Buffer): Promise<string> {
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: false });
  let body = "";
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const tableHtml = XLSX.utils.sheet_to_html(ws, { id: `sheet-${name}`, editable: false });
    body += `<h2 style="margin:24px 0 8px;font-size:16px;font-weight:600;color:#334155;">${escapeHtml(name)}</h2>${tableHtml}`;
  }
  return wrapHtml("Spreadsheet", body);
}

/**
 * Convert a PowerPoint (.pptx) buffer to HTML slides.
 * Extracts slide XML and renders text content and images.
 */
export async function pptxToHtml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  // Extract images from the pptx for embedding
  const imageMap = new Map<string, string>();
  const mediaFiles = Object.keys(zip.files).filter((f) => f.startsWith("ppt/media/"));
  for (const mf of mediaFiles) {
    const data = await zip.files[mf].async("base64");
    const ext = mf.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : `image/${ext}`;
    imageMap.set(mf.split("/").pop() ?? mf, `data:${mime};base64,${data}`);
  }

  let body = "";
  let slideNum = 0;
  for (const sf of slideFiles) {
    slideNum++;
    const xml = await zip.files[sf].async("text");

    // Extract text runs from <a:t> tags
    const texts: string[] = [];
    const textRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(xml)) !== null) {
      texts.push(escapeHtml(match[1]));
    }

    // Extract image references from relationships
    const relPath = sf.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relFile = zip.files[relPath];
    const imageRefs: string[] = [];
    if (relFile) {
      const relXml = await relFile.async("text");
      const relRegex = /Target="[^"]*\/media\/([^"]+)"/g;
      let relMatch: RegExpExecArray | null;
      while ((relMatch = relRegex.exec(relXml)) !== null) {
        const dataUri = imageMap.get(relMatch[1]);
        if (dataUri) imageRefs.push(dataUri);
      }
    }

    body += `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;margin-bottom:20px;min-height:200px;box-shadow:0 1px 3px rgba(0,0,0,.06);">`;
    body += `<div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Slide ${slideNum}</div>`;
    if (imageRefs.length > 0) {
      body += `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">`;
      for (const src of imageRefs) {
        body += `<img src="${src}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain;" />`;
      }
      body += `</div>`;
    }
    for (const t of texts) {
      body += `<p style="margin:6px 0;font-size:14px;line-height:1.6;color:#334155;">${t}</p>`;
    }
    if (texts.length === 0 && imageRefs.length === 0) {
      body += `<p style="color:#94a3b8;font-style:italic;">No extractable content on this slide.</p>`;
    }
    body += `</div>`;
  }

  if (slideNum === 0) {
    body = `<p style="color:#64748b;">No slides found in this presentation.</p>`;
  }

  return wrapHtml("Presentation", body);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      margin: 0; padding: 24px; background: #f8fafc; color: #1e293b;
      line-height: 1.6; font-size: 14px;
    }
    img { max-width: 100%; height: auto; }
    table {
      border-collapse: collapse; width: 100%; margin: 8px 0;
      background: #fff; border-radius: 8px; overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    th, td {
      border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left;
      font-size: 13px;
    }
    th { background: #f1f5f9; font-weight: 600; color: #475569; }
    tr:nth-child(even) td { background: #f8fafc; }
    h1, h2, h3 { color: #0f172a; }
    p { margin: 8px 0; }
    ul, ol { padding-left: 24px; }
    a { color: #2563eb; }
  </style>
</head>
<body>${body}</body>
</html>`;
}
