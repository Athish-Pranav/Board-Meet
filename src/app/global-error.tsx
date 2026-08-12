"use client";

import { useEffect } from "react";

// Next.js replaces the entire root layout with this component when an error
// escapes every nested error boundary, so it has to render its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#faf7f0", color: "#1c1917" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.5rem" }}>Something went wrong</h1>
            <p style={{ color: "#78716c", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
              An unexpected error occurred. The issue has been logged.
              {error.digest ? <span style={{ display: "block", fontSize: "0.75rem", marginTop: "0.4rem" }}>Reference: {error.digest}</span> : null}
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{ background: "#1c1917", color: "#fff", border: "none", borderRadius: "0.5rem", padding: "0.6rem 1.4rem", fontSize: "0.9rem", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
