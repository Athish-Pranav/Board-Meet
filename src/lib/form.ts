import { z } from "zod";

export type FormResult = { error?: string; ok?: boolean };

export function getStr(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function getOptStr(fd: FormData, key: string): string | null {
  const v = getStr(fd, key);
  return v === "" ? null : v;
}

export function getInt(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function getBool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function getDate(fd: FormData, key: string): Date | null {
  const v = getStr(fd, key);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Maps thrown errors to an inline form error. Re-throws Next control-flow signals. */
export function toFormError(e: unknown): FormResult {
  if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest ?? "").startsWith("NEXT_")) {
    throw e; // redirect()/notFound() — must propagate
  }
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
  if (e instanceof Error && e.name === "ForbiddenError") return { error: "You don't have permission to do that." };
  if (e instanceof Error) return { error: e.message };
  return { error: "Something went wrong." };
}
