import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Roboto is bundled locally (not fetched from Google at build time) so builds
// are deterministic and never fail on flaky next/font/google network fetches
// (previously broke CI + occasionally Vercel).
const roboto = localFont({
  src: [
    { path: "./fonts/roboto-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/roboto-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/roboto-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/roboto-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Customer Support Assistant",
  description:
    "AI-powered customer support assistant — answers from your verified company knowledge, captures leads, and hands off to your team.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={roboto.variable}>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
