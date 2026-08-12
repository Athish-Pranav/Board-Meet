// Generates sample PDF board papers and wires them into the repository and the
// upcoming board meeting so the PDF viewer / annotator has something to open.
// Run: node scripts/seed-sample-pdfs.mjs   (uses the local SQLite dev.db)
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORAGE = resolve(root, "storage");
const prisma = new PrismaClient();

async function makePdf(title, paragraphs) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let pageNo = 1; pageNo <= 2; pageNo++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(title, { x: 50, y: 780, size: 18, font: bold, color: rgb(0.1, 0.2, 0.5) });
    page.drawText(`Page ${pageNo}`, { x: 500, y: 780, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
    let y = 740;
    for (const p of paragraphs) {
      const words = p.split(" ");
      let line = "";
      for (const w of words) {
        if (font.widthOfTextAtSize(line + " " + w, 11) > 495) {
          page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0.15, 0.15, 0.2) });
          y -= 16;
          line = w;
        } else line = line ? `${line} ${w}` : w;
      }
      if (line) { page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0.15, 0.15, 0.2) }); y -= 24; }
    }
  }
  return Buffer.from(await doc.save());
}

async function saveFile(buf, key) {
  const full = resolve(STORAGE, key);
  await fs.mkdir(dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
}

async function main() {
  const secretary = await prisma.user.findUnique({ where: { email: "secretary@company.in" } });
  if (!secretary) throw new Error("Run npm run dev:sqlite first (seed users).");

  // 1) Repository document in the Policies folder
  const policies = await prisma.folder.findFirst({ where: { category: "Policies" } });
  if (policies && !(await prisma.document.findFirst({ where: { title: "Code of Conduct Policy" } }))) {
    const buf = await makePdf("Code of Conduct Policy", [
      "This policy sets out the standards of business conduct expected of all directors and employees of the Company.",
      "Directors must act with integrity, avoid conflicts of interest, and maintain the confidentiality of board information.",
      "Breaches of this policy should be reported to the Company Secretary. The Board reviews this policy annually.",
    ]);
    const key = "samples/code-of-conduct.pdf";
    await saveFile(buf, key);
    await prisma.document.create({
      data: { title: "Code of Conduct Policy", folderId: policies.id, classification: "Internal", storageKey: key, fileName: "code-of-conduct.pdf", mimeType: "application/pdf", sizeBytes: buf.length, uploadedById: secretary.id },
    });
    console.log("Added repository PDF: Code of Conduct Policy");
  }

  // 2) Board paper attached to the Q1 meeting's board pack + agenda item
  const meeting = await prisma.meeting.findFirst({ where: { title: "Q1 FY25-26 Board Meeting" } });
  if (meeting && !(await prisma.document.findFirst({ where: { title: "Q1 Financial Results", meetingId: meeting.id } }))) {
    const item = await prisma.agendaItem.findFirst({ where: { meetingId: meeting.id, title: { contains: "financial results" } } });
    const buf = await makePdf("Unaudited Financial Results — Q1 FY25-26", [
      "Revenue for the quarter was Rs. 248 crore, up 12% year on year, driven by strong volumes in the core segment.",
      "EBITDA margin improved to 18.4% on operating leverage and input cost moderation.",
      "The Audit Committee has reviewed these results and recommends them for the Board's approval.",
    ]);
    const key = "samples/q1-financial-results.pdf";
    await saveFile(buf, key);
    const doc = await prisma.document.create({
      data: { title: "Q1 Financial Results", meetingId: meeting.id, agendaItemId: item?.id ?? null, classification: "Confidential", storageKey: key, fileName: "q1-financial-results.pdf", mimeType: "application/pdf", sizeBytes: buf.length, uploadedById: secretary.id, version: 1 },
    });
    let pack = await prisma.boardPack.findFirst({ where: { meetingId: meeting.id, status: "Draft" } });
    if (!pack) pack = await prisma.boardPack.create({ data: { meetingId: meeting.id, version: 1, status: "Draft" } });
    await prisma.boardPackSection.create({ data: { boardPackId: pack.id, agendaItemId: item?.id ?? null, documentId: doc.id, title: "Q1 Financial Results", sequence: 1 } });
    console.log("Added board paper PDF: Q1 Financial Results (in board pack)");
  }

  console.log("Sample PDFs ready. Open them via Documents → Read, or the meeting's Board Pack / Agenda.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
