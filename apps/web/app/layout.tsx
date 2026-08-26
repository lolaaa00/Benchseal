import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { WalletBar } from "@/components/WalletBar";

export const metadata: Metadata = {
  title: "BenchSeal - AI Benchmark Certification",
  description: "Consensus certification for off-chain AI benchmark runs on GenLayer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: "var(--indigo-deep)", color: "var(--ink)", minHeight: "100vh" }}>
        {/* Ambient background wash */}
        <div className="wash">
          <div className="blob b1" />
          <div className="blob b2" />
          <div className="blob b3" />
        </div>

        <WalletProvider>
          {/* Fixed pill nav */}
          <header
            style={{
              position: "fixed",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              width: "calc(100% - 48px)",
              maxWidth: 960,
            }}
          >
            <div
              className="nav-pill"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 16px",
              }}
            >
              {/* Logo + nav links */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link
                  href="/"
                  style={{
                    fontFamily: "Sora, sans-serif",
                    fontSize: 16,
                    fontWeight: 800,
                    color: "var(--ink)",
                    textDecoration: "none",
                    letterSpacing: "-0.01em",
                    marginRight: 8,
                  }}
                >
                  <span style={{ color: "var(--orange)" }}>Bench</span>Seal
                </Link>
                <nav style={{ display: "flex", gap: 2 }}>
                  {[
                    { href: "/", label: "Registry" },
                    { href: "/runs/new", label: "Submit Run" },
                    { href: "/failure-atlas", label: "Atlas" },
                  ].map(({ href, label }) => (
                    <Link key={href} href={href} className="nav-link">
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>

              {/* Wallet bar */}
              <WalletBar />
            </div>
          </header>

          {/* Page content — push down past fixed nav */}
          <div className="page-wrap" style={{ paddingTop: 88 }}>
            <main style={{ minHeight: "calc(100vh - 88px)" }}>{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
