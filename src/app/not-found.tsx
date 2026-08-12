import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-ink-950">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The page you're looking for doesn't exist or may have moved.</p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-block">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
