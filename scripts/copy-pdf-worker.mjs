// Copies pdfjs-dist's worker into public/ as a same-origin static asset.
// Run automatically on every `npm install` so it can't silently go stale if
// pdfjs-dist is ever upgraded — see the comment in DocViewer.tsx for why this
// needs to be same-origin rather than bundled or loaded from a CDN.
import { copyFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs");
const dest = join(__dirname, "..", "public", "pdf.worker.min.mjs");

try {
  copyFileSync(src, dest);
  console.log("[copy-pdf-worker] pdf.worker.min.mjs -> public/");
} catch (err) {
  console.warn("[copy-pdf-worker] skipped:", err.message);
}
