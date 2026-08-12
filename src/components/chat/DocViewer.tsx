"use client";

import { useEffect, useState, useRef, useCallback } from "react";

type Kind = "pdf" | "image" | "docx" | "excel" | "pptx" | "other";

function kindOf(name: string, type: string): Kind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext) || type.startsWith("image/")) return "image";
  if (ext === "docx") return "docx";
  if (["xlsx", "xls", "csv"].includes(ext)) return "excel";
  if (ext === "pptx") return "pptx";
  return "other";
}

export function DocViewer({
  url,
  name,
  type,
  onClose,
  embedded = false,
  closeLabel = "✕",
  allowDownload = false,
  scrollRatio,
  onScroll,
  drawingMode,
  drawColor,
  strokes,
  onStrokesChange,
}: {
  url: string;
  name: string;
  type: string;
  onClose: () => void;
  embedded?: boolean;
  closeLabel?: string;
  allowDownload?: boolean;
  scrollRatio?: number;
  onScroll?: (ratio: number) => void;
  drawingMode?: boolean;
  drawColor?: string;
  strokes?: any[];
  onStrokesChange?: (strokes: any[]) => void;
}) {
  const kind = kindOf(name, type);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(kind === "image" ? "ready" : "loading");
  const [html, setHtml] = useState("");
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [sheet, setSheet] = useState(0);
  const [slides, setSlides] = useState<string[][]>([]);
  const [errMsg, setErrMsg] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [pdfRenderProgress, setPdfRenderProgress] = useState<{ done: number; total: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
  // Cache the bounding rect so we don't force a layout recalc on every single
  // mousemove/touchmove — getBoundingClientRect is expensive at 60+ fps.
  const cachedRectRef = useRef<DOMRect | null>(null);
  const rafIdRef = useRef<number>(0);
  // Track the last drawn index so live drawing only paints the NEW segment
  // instead of re-stroking the entire current path every frame.
  const lastDrawnIndexRef = useRef(0);

  /** Sync the canvas pixel buffer to its CSS-rendered display size.
   *  CSS (absolute inset-0 w-full h-full) controls the display size;
   *  we just match the backing-store resolution to it for crisp lines. */
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // clientWidth/Height = the actual CSS-rendered pixel dimensions
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    // Match the buffer to the display — no DPR scaling so coordinates
    // in the 2d context map 1:1 to CSS pixels without extra transforms.
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  }, []);

  /** Paint all committed strokes onto the canvas. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    syncCanvasSize();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    (strokes || []).forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width || 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
      }
      ctx.stroke();
    });
  }, [strokes, syncCanvasSize]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => { cachedRectRef.current = null; redraw(); });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [redraw]);

  /** Convert a client-coordinate event (mouse or touch) into normalised 0-1
   *  coordinates relative to the canvas, using the cached bounding rect. */
  const toNorm = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    if (!cachedRectRef.current) cachedRectRef.current = canvas.getBoundingClientRect();
    const r = cachedRectRef.current;
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  }, []);

  /** Draw the live (uncommitted) stroke incrementally — only the segments
   *  added since the last paint, so we never re-stroke earlier segments. */
  const paintLiveSegments = useCallback(() => {
    rafIdRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = currentStrokePointsRef.current;
    const from = lastDrawnIndexRef.current;
    if (from >= pts.length - 1) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.strokeStyle = drawColor || "#e11d48";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[from].x * w, pts[from].y * h);
    for (let i = from + 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * w, pts[i].y * h);
    }
    ctx.stroke();
    lastDrawnIndexRef.current = pts.length - 1;
  }, [drawColor]);

  // ── Pointer-down (mouse + touch) ────────────────────────────────────
  const beginStroke = useCallback((clientX: number, clientY: number) => {
    // Refresh the rect cache at the start of each stroke (cheap — once per
    // stroke, not once per point).
    cachedRectRef.current = canvasRef.current?.getBoundingClientRect() ?? null;
    const pt = toNorm(clientX, clientY);
    isDrawingRef.current = true;
    currentStrokePointsRef.current = [pt];
    lastDrawnIndexRef.current = 0;
  }, [toNorm]);

  // ── Pointer-move (mouse + touch) ────────────────────────────────────
  const extendStroke = useCallback((clientX: number, clientY: number) => {
    if (!isDrawingRef.current) return;
    currentStrokePointsRef.current.push(toNorm(clientX, clientY));
    // Coalesce paints into a single rAF — multiple mousemove events can fire
    // between frames; painting once per frame is enough and avoids jank.
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(paintLiveSegments);
    }
  }, [toNorm, paintLiveSegments]);

  // ── Pointer-up (mouse + touch) ──────────────────────────────────────
  const commitStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
    if (currentStrokePointsRef.current.length < 2) return;
    const newStroke = { color: drawColor || "#e11d48", width: 3, points: currentStrokePointsRef.current };
    onStrokesChange?.([...(strokes || []), newStroke]);
  }, [drawColor, onStrokesChange, strokes]);

  // Clean up any pending rAF on unmount.
  useEffect(() => () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); }, []);

  // ── React event handlers (mouse) ────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => beginStroke(e.clientX, e.clientY);
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => extendStroke(e.clientX, e.clientY);
  const handleMouseUp = () => commitStroke();

  // ── React event handlers (touch — enables drawing on tablets/phones) ─
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    e.preventDefault(); // prevent scroll while drawing
    const t = e.touches[0];
    beginStroke(t.clientX, t.clientY);
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    extendStroke(t.clientX, t.clientY);
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    commitStroke();
  };

  // Renders the PDF as real, stacked <canvas> page elements in normal document
  // flow (via PDF.js) instead of the browser's built-in PDF viewer inside an
  // <iframe>. The native iframe viewer scrolls its own content internally,
  // invisibly to the parent page — so a drawing overlay positioned over it had
  // no way to track that scroll, and stayed pinned to a fixed screen position
  // while the document moved underneath it. Rendering pages as plain canvases
  // in the SAME scrollable container as the overlay fixes that: both scroll
  // together because they're just ordinary sibling elements now, not two
  // independently-scrolling layers.
  useEffect(() => {
    if (kind !== "pdf") return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loadingTask: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfDoc: any = null;
    (async () => {
      try {
        setStatus("loading");
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Could not load the file");
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // Served same-origin from public/ (copied there by
        // scripts/copy-pdf-worker.mjs on every `npm install`), not bundled and
        // not loaded from a CDN. Bundling it fails: pdfjs-dist's worker is an
        // ES module using `import.meta` internally, which Next's build (Terser,
        // minifying the `new URL(...)`-referenced asset) can't parse — a known,
        // common pdfjs-dist + Next.js incompatibility, regardless of webpack
        // config. A cross-origin CDN URL was tried next and hung indefinitely
        // instead of erroring — this app sends Cross-Origin-Embedder-Policy
        // site-wide (for Zoom's gallery view), and loading a Worker script
        // cross-origin under that policy is exactly the kind of thing that can
        // fail silently rather than reject. Same-origin sidesteps both.
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        // React 18 StrictMode double-invokes this effect in dev, mounting it,
        // tearing it down, then mounting again. Without destroying the FIRST
        // (throwaway) loading task/document here, its worker/port is never
        // released — pdfjs-dist can then hang the SECOND (real) getDocument()
        // call waiting on a worker that's still tied up with the abandoned
        // one. A 20s timeout is a backstop for any other cause of the same
        // symptom: better an actionable error than an infinite spinner.
        loadingTask = pdfjsLib.getDocument({ data: buf });
        const pdf = await Promise.race([
          loadingTask.promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out rendering this PDF — try closing and reopening it.")), 20000)),
        ]);
        if (cancelled) return;
        pdfDoc = pdf;
        if (!pdfContainerRef.current) return;
        pdfContainerRef.current.innerHTML = "";

        const scale = 1.5;

        // Fast pass: lay out every page as a correctly-sized BLANK canvas up
        // front. Getting a page's viewport is cheap (no pixel rendering); this
        // establishes the document's real scrollable height immediately, so a
        // long or scanned PDF is visible and scrollable right away instead of
        // sitting behind a spinner for however long full rendering takes.
        const pages: { canvas: HTMLCanvasElement; pageNum: number }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled || !pdfContainerRef.current) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-2 block bg-white shadow-sm";
          pdfContainerRef.current.appendChild(canvas);
          pages.push({ canvas, pageNum: i });
        }
        if (cancelled) return;
        setStatus("ready");

        // Slow pass: render each page's real content into its already-placed
        // canvas, in the background — a large or scanned document can take a
        // while here, but the user can already scroll and read while it fills in.
        setPdfRenderProgress({ done: 0, total: pages.length });
        for (const { canvas, pageNum } of pages) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale });
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          setPdfRenderProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
        }
        if (!cancelled) setPdfRenderProgress(null);
      } catch (e) {
        if (!cancelled) { setErrMsg((e as Error).message || "Preview failed"); setStatus("error"); }
      }
    })();
    return () => {
      cancelled = true;
      // Release the worker/port so an abandoned StrictMode-throwaway instance
      // can never block the next real load (see the comment above).
      try { pdfDoc?.destroy?.(); } catch { /* already gone */ }
      try { loadingTask?.destroy?.(); } catch { /* already gone */ }
    };
  }, [kind, url]);

  useEffect(() => {
    if (scrollRatio === undefined || !scrollRef.current) return;
    const target = scrollRef.current;
    const maxScroll = target.scrollHeight - target.clientHeight;
    if (maxScroll <= 0) return;
    const newScrollTop = scrollRatio * maxScroll;
    if (Math.abs(target.scrollTop - newScrollTop) > 2) {
      isProgrammaticScrollRef.current = true;
      target.scrollTop = newScrollTop;
    }
  }, [scrollRatio]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      return;
    }
    if (!onScroll) return;
    const target = e.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    if (maxScroll <= 0) return;
    const ratio = target.scrollTop / maxScroll;
    onScroll(ratio);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (kind === "pdf" || kind === "image" || kind === "other") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Could not load the file");
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        if (kind === "docx") {
          const mammoth = await import("mammoth");
          const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (!cancelled) { setHtml(value || "<p>(empty document)</p>"); setStatus("ready"); }
        } else if (kind === "excel") {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(buf, { type: "array" });
          const out = wb.SheetNames.map((n) => ({ name: n, html: XLSX.utils.sheet_to_html(wb.Sheets[n]) }));
          if (!cancelled) { setSheets(out); setStatus("ready"); }
        } else if (kind === "pptx") {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(buf);
          const files = Object.keys(zip.files)
            .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
            .sort((a, b) => (Number(a.match(/slide(\d+)/)?.[1]) || 0) - (Number(b.match(/slide(\d+)/)?.[1]) || 0));
          const out: string[][] = [];
          for (const f of files) {
            const xml = await zip.files[f].async("string");
            const dom = new DOMParser().parseFromString(xml, "application/xml");
            out.push(Array.from(dom.getElementsByTagName("a:t")).map((n) => n.textContent || "").filter((t) => t.trim()));
          }
          if (!cancelled) { setSlides(out); setStatus("ready"); }
        }
      } catch (e) {
        if (!cancelled) { setErrMsg((e as Error).message || "Preview failed"); setStatus("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [kind, url]);

  const canvasOverlay = strokes !== undefined ? (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 z-20 h-full w-full touch-none ${drawingMode ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ backgroundColor: "rgba(255,255,255,0.01)" }}
    />
  ) : null;

  const panel = (
    <div
      className={
        embedded
          ? "relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-cream-50"
          : "relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-cream-50 shadow-pop"
      }
      onClick={(e) => e.stopPropagation()}
    >
        <div className="flex items-center justify-between gap-3 border-b border-cream-300 bg-white px-4 py-3">
          <p className="min-w-0 flex-1 truncate font-serif text-sm font-semibold text-brand-900">{name}</p>
          {pdfRenderProgress && pdfRenderProgress.done < pdfRenderProgress.total ? (
            <span className="shrink-0 text-xs text-slate-400">Rendering page {pdfRenderProgress.done + 1} of {pdfRenderProgress.total}…</span>
          ) : null}
          {allowDownload ? <a href={url} download={name} className="btn-secondary btn-sm">Download</a> : null}
          <button onClick={onClose} className="btn-secondary btn-sm" aria-label="Close">{closeLabel}</button>
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto bg-cream-100">
          {kind === "pdf" ? (
            // The container div is ALWAYS rendered — the render effect needs
            // pdfContainerRef.current to exist before it can ever set status
            // to "ready", so gating this div behind status !== "loading"
            // (as before) meant it could never mount, the effect always found
            // a null ref, returned early, and status stayed "loading" forever.
            // Loading/error states now overlay on top instead of replacing it.
            <div className="relative w-full py-4">
              <div ref={pdfContainerRef} className="flex flex-col items-center" />
              {canvasOverlay}
              {status === "loading" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-cream-100 text-sm text-slate-500">
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-cream-300 border-t-brand-600" /> Rendering preview…
                </div>
              ) : status === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-cream-100 p-8 text-center">
                  <p className="text-sm text-slate-500">Couldn&apos;t render a preview ({errMsg}).</p>
                  {allowDownload ? <a href={url} download={name} className="btn-primary">Download file</a> : <p className="text-xs text-slate-400">Downloading is disabled for this document.</p>}
                </div>
              ) : null}
            </div>
          ) : kind === "image" ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="relative max-h-full max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={name} className="max-h-full max-w-full rounded-lg" />
                {canvasOverlay}
              </div>
            </div>
          ) : status === "loading" ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-cream-300 border-t-brand-600" /> Rendering preview…
            </div>
          ) : status === "error" || kind === "other" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-slate-500">{kind === "other" ? "In-app preview isn't available for this file type." : `Couldn't render a preview (${errMsg}).`}</p>
              {allowDownload ? <a href={url} download={name} className="btn-primary">Download file</a> : <p className="text-xs text-slate-400">Downloading is disabled for this document.</p>}
            </div>
          ) : kind === "docx" ? (
            <div className="relative mx-auto max-w-3xl my-4">
              <div className="bg-white p-8 text-sm leading-relaxed text-slate-800 shadow-sm [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-brand-900 [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-cream-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-cream-300 [&_th]:bg-cream-100 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: html }} />
              {canvasOverlay}
            </div>
          ) : kind === "excel" ? (
            <div className="relative inline-block min-w-full bg-white p-3">
              {sheets.length > 1 ? (
                <div className="flex gap-1 overflow-x-auto border-b border-cream-300 bg-white pb-2 mb-3">
                  {sheets.map((s, i) => (
                    <button key={s.name} onClick={() => setSheet(i)} className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${i === sheet ? "bg-brand-600 text-cream-50" : "text-slate-600 hover:bg-cream-200"}`}>{s.name}</button>
                  ))}
                </div>
              ) : null}
              <div className="text-xs [&_table]:border-collapse [&_td]:whitespace-nowrap [&_td]:border [&_td]:border-cream-300 [&_td]:px-2 [&_td]:py-1 [&_tr:first-child_td]:bg-cream-100 [&_tr:first-child_td]:font-semibold" dangerouslySetInnerHTML={{ __html: sheets[sheet]?.html ?? "" }} />
              {canvasOverlay}
            </div>
          ) : kind === "pptx" ? (
            <div className="relative mx-auto max-w-3xl">
              <div className="space-y-4 p-6">
                <p className="text-center text-xs text-slate-400">{slides.length} slide{slides.length === 1 ? "" : "s"} · text preview (download for full visuals)</p>
                {slides.map((lines, i) => (
                  <div key={i} className="rounded-xl border border-cream-300 bg-white p-5 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Slide {i + 1}</p>
                    {lines.length === 0 ? <p className="text-sm text-slate-400">(no text)</p> : (
                      <>
                        <p className="font-serif text-lg font-semibold text-brand-900">{lines[0]}</p>
                        {lines.length > 1 ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{lines.slice(1).map((l, j) => <li key={j}>{l}</li>)}</ul> : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
              {canvasOverlay}
            </div>
          ) : null}
        </div>
    </div>
  );

  if (embedded) return panel;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" />
      {panel}
    </div>
  );
}
