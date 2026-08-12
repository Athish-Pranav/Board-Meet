import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card max-w-md p-8 text-center">
        <p className="text-5xl font-bold text-brand-600">403</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">Not authorised</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your role does not have permission to view this page. If you believe this is an error, contact the Company
          Secretary or an administrator.
        </p>
        <Link href="/dashboard" className="btn-primary mt-5 inline-flex">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
