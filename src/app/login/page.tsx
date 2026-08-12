import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

const SSO_ERRORS: Record<string, string> = {
  sso_state: "Sign-in session expired. Please try again.",
  sso_token: "Microsoft sign-in failed during token exchange.",
  sso_email: "Could not read your email from Microsoft.",
  sso_nouser: "No active account matches your Microsoft email. Ask an administrator to add you first.",
};

const HIGHLIGHTS = [
  ["Agenda & board packs", "Build, version and compile to a single secure PDF."],
  ["Minutes & resolutions", "Draft → circulate → approve, with electronic voting."],
  ["Compliance built-in", "Quorum, notice and minutes rules from the Companies Act."],
  ["Secure & audited", "Role-based access with a full audit trail on every write."],
];

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const ssoError = searchParams.error ? SSO_ERRORS[searchParams.error] : undefined;

  return (
    <main className="flex min-h-screen bg-slate-100">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-ink-800 to-ink-950 p-12 text-cream-50 lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gold-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/25 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-white/95 px-2.5 py-1 shadow">
            <img src="/logo.png" alt="Precot Logo" className="h-7 w-auto" />
          </div>
          <span className="font-serif text-lg font-semibold text-white/95">Board Meeting Management</span>
        </div>
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300">Governance, refined</p>
          <h1 className="mt-3 max-w-md text-[40px] font-semibold leading-[1.1] text-cream-50">The complete board governance workspace.</h1>
          <div className="mt-5 h-px w-24 bg-gradient-to-r from-gold-400 to-transparent" />
          <p className="mt-5 max-w-md text-sm text-slate-300">Run the full meeting lifecycle — agenda, board packs, minutes, resolutions and compliance — in one secure place.</p>
          <ul className="mt-8 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map(([t, d]) => (
              <li key={t} className="rounded-xl border border-gold-500/15 bg-white/5 p-3.5 backdrop-blur-sm transition hover:border-gold-500/40">
                <p className="text-sm font-semibold text-cream-50">{t}</p>
                <p className="mt-0.5 text-xs text-slate-400">{d}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">{env.company.name} · Companies Act 2013 · SS-1</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <img src="/logo.png" alt="Precot Logo" className="mx-auto mb-3 h-10 w-auto" />
            <h1 className="text-xl font-semibold text-brand-900">Board Meeting Management</h1>
          </div>

          <div className="card p-7 shadow-soft">
            <h2 className="font-serif text-2xl font-semibold text-brand-900">Welcome back</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">Sign in to your secretariat workspace.</p>

            {ssoError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{ssoError}</div> : null}

            <ActionForm action={loginAction} submitLabel="Sign in">
              <Field label="Email" required>
                <input name="email" type="email" autoComplete="username" className="input" placeholder="you@company.in" required />
              </Field>
              <Field label="Password" required>
                <input name="password" type="password" autoComplete="current-password" className="input" required />
              </Field>
            </ActionForm>

            {env.azureAd.enabled ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <a href="/api/auth/azure/start" className="btn-secondary w-full justify-center">Sign in with Microsoft</a>
              </div>
            ) : null}
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">Internal use only. Access is logged.</p>
        </div>
      </div>
    </main>
  );
}
