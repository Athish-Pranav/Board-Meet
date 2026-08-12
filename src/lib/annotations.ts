import "server-only";

/**
 * Live, shared markup on a board pack during a meeting — our own replacement
 * for Zoom's screen-share annotation, which Component View doesn't expose
 * (confirmed absent from its public API; Zoom's own docs say Component View
 * "may not include some features supported in client view").
 *
 * In-memory and ephemeral by design, mirroring Zoom's own annotations (which
 * also don't persist after a call): this is live markup for a discussion, not
 * a governance record. Matches this app's existing single-instance assumption
 * (no Redis/queue anywhere) — same pattern the old rtc-hub.ts used.
 */

export type Stroke = { color: string; width: number; points: { x: number; y: number }[] };
type AnnotationState = { strokes: Stroke[]; version: number };

const MAX_STROKES = 400; // bounds memory on a long meeting; oldest strokes drop first

const store = new Map<number, AnnotationState>();

export function getAnnotations(boardPackId: number): AnnotationState {
  return store.get(boardPackId) ?? { strokes: [], version: 0 };
}

export function addStroke(boardPackId: number, stroke: Stroke): AnnotationState {
  const current = store.get(boardPackId) ?? { strokes: [], version: 0 };
  const strokes = [...current.strokes, stroke].slice(-MAX_STROKES);
  const next = { strokes, version: current.version + 1 };
  store.set(boardPackId, next);
  return next;
}

export function clearAnnotations(boardPackId: number): AnnotationState {
  const next = { strokes: [], version: (store.get(boardPackId)?.version ?? 0) + 1 };
  store.set(boardPackId, next);
  return next;
}
