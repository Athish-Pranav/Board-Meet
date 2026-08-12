import type { Metadata } from "next";
import { Jost, Fraunces } from "next/font/google";
import "./globals.css";

// Jost — geometric, elegant grotesque for UI/body (modern luxury).
const sans = Jost({ subsets: ["latin"], variable: "--font-sans", display: "swap", weight: ["300", "400", "500", "600", "700"] });
// Fraunces — characterful high-contrast display serif with optical sizing (couture editorial).
const playfair = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap", weight: ["400", "500", "600", "700", "900"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Board Meeting Management System",
  description: "Single-tenant board & committee meeting lifecycle management (Companies Act 2013 + SS-1).",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${sans.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
