"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/format";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string };
type Push = (t: { type?: ToastType; message: string }) => void;

const ToastCtx = createContext<Push>(() => {});

export function useToast(): Push {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<Push>((t) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type: t.type ?? "info", message: t.message }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3800);
  }, []);

  const remove = (id: number) => setToasts((p) => p.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(92vw,360px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "animate-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-cream-50 p-3.5 shadow-pop",
              t.type === "success" && "border-emerald-200",
              t.type === "error" && "border-red-200",
              t.type === "info" && "border-cream-300",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white",
                t.type === "success" && "bg-emerald-500",
                t.type === "error" && "bg-red-500",
                t.type === "info" && "bg-brand-700",
              )}
            >
              {t.type === "success" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : t.type === "error" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><path d="M12 8v5M12 16h.01" strokeLinecap="round" /></svg>
              )}
            </span>
            <p className="flex-1 pt-0.5 text-sm text-slate-700">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
