import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { env } from "./env";

export type PackSection = {
  title: string;
  classification?: string;
  document?: { fileName: string; mimeType: string; bytes: Buffer } | null;
};

export type CompileInput = {
  meetingTitle: string;
  meetingDate: Date;
  version: number;
  sections: PackSection[];
};

const MARGIN = 50;
const A4: [number, number] = [595.28, 841.89];

// Meeting/agenda titles are free-typed and often pasted from Word or Outlook,
// which silently swaps plain ASCII punctuation for Unicode look-alikes (a
// typographic hyphen instead of "-", curly quotes, an en/em dash, …).
// StandardFonts.Helvetica uses WinAnsiEncoding, a single-byte encoding that
// can't represent most of them — pdf-lib throws "WinAnsi cannot encode ..."
// and compilation fails outright. Map the common cases back to their plain
// ASCII equivalents, then strip anything else outside WinAnsi's single-byte
// range as a backstop, so no future character (emoji, CJK, Cyrillic, …) can
// ever crash compilation again — it just prints as "?" instead of failing.
const PDF_SAFE_REPLACEMENTS: Record<string, string> = {
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", // hyphen/dash variants
  "‘": "'", "’": "'", "‚": "'", "‛": "'", // single quotes
  "“": '"', "”": '"', "„": '"', "‟": '"', // double quotes
  "…": "...", // ellipsis
  " ": " ", // non-breaking space
  "•": "-", // bullet
};

function sanitizeForPdf(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = PDF_SAFE_REPLACEMENTS[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    out += ch.codePointAt(0)! <= 0xff ? ch : "?";
  }
  return out;
}

function drawWrapped(page: PDFPage, rawText: string, x: number, y: number, font: PDFFont, size: number, maxWidth: number, lineGap = 4): number {
  const text = sanitizeForPdf(rawText);
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursorY, size, font, color: rgb(0.1, 0.1, 0.15) });
      cursorY -= size + lineGap;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursorY, size, font, color: rgb(0.1, 0.1, 0.15) });
    cursorY -= size + lineGap;
  }
  return cursorY;
}

/**
 * Compiles board-pack sections into a single paginated PDF with a cover page,
 * a table of contents, per-section divider pages, and page-number footers.
 * Source PDFs are merged page-for-page; images are embedded; other file types
 * get a placeholder referring the reader to the document repository.
 */
export async function compileBoardPack(input: CompileInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.meetingTitle} — Board Pack v${input.version}`);
  doc.setProducer("Board Meeting Management System");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const toc: { title: string; page: number }[] = [];

  // --- Body: one divider page per section, then the section's document ----
  for (const section of input.sections) {
    const divider = doc.addPage(A4);
    const startPageIndex = doc.getPageCount() - 1; // 0-based, body-only for now
    toc.push({ title: section.title, page: startPageIndex });

    divider.drawText("SECTION", { x: MARGIN, y: A4[1] - MARGIN - 10, size: 10, font: bold, color: rgb(0.3, 0.3, 0.45) });
    let y = A4[1] - MARGIN - 40;
    y = drawWrapped(divider, section.title, MARGIN, y, bold, 20, A4[0] - MARGIN * 2);
    if (section.classification) {
      divider.drawText(sanitizeForPdf(`Classification: ${section.classification}`), { x: MARGIN, y: y - 10, size: 10, font, color: rgb(0.4, 0.4, 0.5) });
    }
    if (section.document) {
      divider.drawText(sanitizeForPdf(`Attachment: ${section.document.fileName}`), { x: MARGIN, y: y - 28, size: 10, font, color: rgb(0.4, 0.4, 0.5) });
    }

    const d = section.document;
    if (!d) continue;
    try {
      if (d.mimeType === "application/pdf" || d.fileName.toLowerCase().endsWith(".pdf")) {
        const src = await PDFDocument.load(d.bytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
      } else if (/image\/(png)/.test(d.mimeType) || d.fileName.toLowerCase().endsWith(".png")) {
        const img = await doc.embedPng(d.bytes);
        embedImagePage(doc, img.width, img.height, (page, w, h, ix, iy) => page.drawImage(img, { x: ix, y: iy, width: w, height: h }));
      } else if (/image\/(jpe?g)/.test(d.mimeType) || /\.jpe?g$/i.test(d.fileName)) {
        const img = await doc.embedJpg(d.bytes);
        embedImagePage(doc, img.width, img.height, (page, w, h, ix, iy) => page.drawImage(img, { x: ix, y: iy, width: w, height: h }));
      } else {
        const p = doc.addPage(A4);
        p.drawText("Attachment not inlined", { x: MARGIN, y: A4[1] / 2, size: 14, font: bold, color: rgb(0.4, 0.1, 0.1) });
        p.drawText(sanitizeForPdf(`${d.fileName} (${d.mimeType}) — open it from the document repository.`), { x: MARGIN, y: A4[1] / 2 - 22, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
      }
    } catch (err) {
      const p = doc.addPage(A4);
      p.drawText("Could not render attachment", { x: MARGIN, y: A4[1] / 2, size: 14, font: bold, color: rgb(0.4, 0.1, 0.1) });
      p.drawText(sanitizeForPdf(`${d.fileName}: ${(err as Error).message}`), { x: MARGIN, y: A4[1] / 2 - 22, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  // --- Front matter: cover + TOC inserted at the front --------------------
  const FRONT_PAGES = 2;
  const cover = doc.insertPage(0, A4);
  const tocPage = doc.insertPage(1, A4);

  cover.drawText("CONFIDENTIAL", { x: MARGIN, y: A4[1] - MARGIN, size: 11, font: bold, color: rgb(0.6, 0.1, 0.1) });
  cover.drawText("BOARD PACK", { x: MARGIN, y: A4[1] - MARGIN - 60, size: 30, font: bold, color: rgb(0.11, 0.22, 0.55) });
  let cy = A4[1] - MARGIN - 110;
  cy = drawWrapped(cover, input.meetingTitle, MARGIN, cy, bold, 18, A4[0] - MARGIN * 2);
  cover.drawText(sanitizeForPdf(env.company.name), { x: MARGIN, y: cy - 8, size: 12, font, color: rgb(0.2, 0.2, 0.3) });
  cover.drawText(
    sanitizeForPdf(input.meetingDate.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })),
    { x: MARGIN, y: cy - 30, size: 11, font, color: rgb(0.3, 0.3, 0.4) },
  );
  cover.drawText(`Version ${input.version}`, { x: MARGIN, y: cy - 50, size: 10, font, color: rgb(0.4, 0.4, 0.5) });

  tocPage.drawText("Table of Contents", { x: MARGIN, y: A4[1] - MARGIN, size: 18, font: bold, color: rgb(0.11, 0.22, 0.55) });
  let ty = A4[1] - MARGIN - 36;
  toc.forEach((entry, i) => {
    const pageNo = entry.page + FRONT_PAGES + 1; // 1-based final page number
    const label = sanitizeForPdf(`${i + 1}. ${entry.title}`);
    tocPage.drawText(label.length > 80 ? label.slice(0, 79) + "…" : label, { x: MARGIN, y: ty, size: 11, font, color: rgb(0.15, 0.15, 0.2) });
    tocPage.drawText(String(pageNo), { x: A4[0] - MARGIN - 20, y: ty, size: 11, font, color: rgb(0.15, 0.15, 0.2) });
    ty -= 20;
    if (ty < MARGIN + 20) ty = MARGIN + 20;
  });

  // --- Footers: page X of Y on every page ---------------------------------
  const total = doc.getPageCount();
  doc.getPages().forEach((page, idx) => {
    const { width } = page.getSize();
    page.drawText(`Page ${idx + 1} of ${total}`, { x: width - MARGIN - 70, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.55) });
    page.drawText(`${sanitizeForPdf(env.company.name)} — Confidential`, { x: MARGIN, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.55) });
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function embedImagePage(doc: PDFDocument, imgW: number, imgH: number, draw: (page: PDFPage, w: number, h: number, x: number, y: number) => void) {
  const page = doc.addPage(A4);
  const maxW = A4[0] - MARGIN * 2;
  const maxH = A4[1] - MARGIN * 2;
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);
  const w = imgW * scale;
  const h = imgH * scale;
  draw(page, w, h, (A4[0] - w) / 2, (A4[1] - h) / 2);
}
