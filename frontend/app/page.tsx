"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, []);

  return (
    <div
      style={{
        minHeight: "100svh",
        background: "var(--bg)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        isolation: "isolate",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "clamp(20px, 2.4vw, 34px) var(--gutter)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 200,
            fontSize: "clamp(20px, 1.75vw, 30px)",
            letterSpacing: "0.16em",
            color: "var(--text)",
            lineHeight: 1,
          }}
        >
          LEXIS
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "clamp(16px, 2vw, 32px)" }}>
          <Link href="/login"
            style={{ fontFamily:"var(--font-mono)", fontSize:"clamp(11px,0.78vw,14px)", letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--text-dim)", textDecoration:"none", transition:"color 0.25s ease" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
          >
            Sign In
          </Link>
          <Link href="/register" className="btn btn--ghost btn--sm">Join Up</Link>
        </div>
      </nav>

      {/* Hero */}
      <main
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 var(--gutter)",
        }}
      >
        <div
          className="fade-in-up"
          style={{
            width: "min(34vw, 560px)",
            minWidth: "320px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="chip">[ Voice Intelligence ]</div>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 200,
              fontSize: "clamp(54px, 6.2vw, 110px)",
              letterSpacing: "0.03em",
              lineHeight: 0.95,
              marginTop: "clamp(28px, 3vw, 52px)",
            }}
          >
            LEXIS
          </h1>

          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 300,
              fontSize: "clamp(11px, 0.94vw, 16px)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginTop: "clamp(14px, 1.4vw, 24px)",
              lineHeight: 1.4,
            }}
          >
            Real-time meeting intelligence.
          </p>

          <div
            style={{
              marginTop: "clamp(38px, 4.6vw, 72px)",
              display: "flex",
              flexDirection: "column",
              gap: "clamp(12px, 1.2vw, 18px)",
            }}
          >
            <Link href="/register" className="btn btn--solid btn--wide">
              Get Started
            </Link>
            <Link href="/login" className="btn btn--ghost btn--wide">
              Sign In
            </Link>
          </div>

          <Link
            href="/login"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(11px, 0.74vw, 13px)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-dimmer)",
              textDecoration: "none",
              alignSelf: "center",
              marginTop: "clamp(24px, 2.6vw, 40px)",
              transition: "color 0.25s ease",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-dim)"; (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-dimmer)"; (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none"; }}
          >
            I have an invite key
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--line)",
          padding: "clamp(18px, 1.7vw, 30px) var(--gutter)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 300,
            fontSize: "clamp(11px, 0.78vw, 14px)",
            color: "var(--text-dim)",
            lineHeight: 1.5,
          }}
        >
          By using Lexis you accept our{" "}
          <a href="#" style={{ color:"var(--text)", textDecoration:"underline", textUnderlineOffset:"3px", textDecorationThickness:"1px" }}>Privacy Notice</a>
          {" "}and{" "}
          <a href="#" style={{ color:"var(--text)", textDecoration:"underline", textUnderlineOffset:"3px", textDecorationThickness:"1px" }}>Terms of Service</a>.
        </p>
      </footer>
    </div>
  );
}
