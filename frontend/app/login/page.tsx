"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { auth, setToken, setUser } from "@/lib/api";

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "YOUR_GOOGLE_CLIENT_ID";

export default function LoginPage() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <LoginView />
    </GoogleOAuthProvider>
  );
}

function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await auth.login(email, password);
      setToken(data.token);
      setUser(data.user);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Login failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(credential: string) {
    setError("");
    setLoading(true);
    try {
      const { data } = await auth.google(credential);
      setToken(data.token);
      setUser(data.user);
      router.push("/dashboard");
    } catch {
      setError("Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

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
      {/* ── Top nav ─────────────────────────────────────────────── */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "clamp(20px, 2.4vw, 34px) var(--gutter)",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 200,
            fontSize: "clamp(20px, 1.75vw, 30px)",
            letterSpacing: "0.16em",
            color: "var(--text)",
            textDecoration: "none",
            lineHeight: 1,
          }}
        >
          LEXIS
        </Link>
        <span
          className="chip"
          style={{ fontSize: "11px", letterSpacing: "0.18em" }}
        >
          [ Auth ]
        </span>
      </nav>

      {/* ── Center panel ────────────────────────────────────────── */}
      <main
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px var(--gutter)",
        }}
      >
        <div
          className="fade-in-up"
          style={{
            width: "100%",
            maxWidth: "440px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Chip */}
          <div className="chip" style={{ alignSelf: "flex-start" }}>
            [ Sign In ]
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 200,
              fontSize: "clamp(44px, 5.5vw, 80px)",
              letterSpacing: "0.03em",
              lineHeight: 0.95,
              marginTop: "clamp(24px, 2.8vw, 44px)",
              color: "var(--text)",
            }}
          >
            LEXIS
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 300,
              fontSize: "clamp(11px, 0.88vw, 15px)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginTop: "clamp(12px, 1.2vw, 20px)",
              lineHeight: 1.4,
            }}
          >
            Voice intelligence. Enter your credentials.
          </p>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            style={{
              marginTop: "clamp(32px, 4vw, 64px)",
              display: "flex",
              flexDirection: "column",
              gap: "clamp(16px, 1.6vw, 28px)",
            }}
          >
            <div>
              <label className="sr-only" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input-field"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="sr-only" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input-field"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "rgba(248, 113, 113, 0.9)",
                  letterSpacing: "0.1em",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn--solid btn--wide"
              disabled={loading}
              style={{ marginTop: "8px" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginTop: "clamp(20px, 2vw, 32px)",
            }}
          >
            <div className="divider" />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.14em",
                color: "var(--text-dimmer)",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
              }}
            >
              or
            </span>
            <div className="divider" />
          </div>

          {/* Google */}
          <div
            style={{
              marginTop: "clamp(16px, 1.6vw, 24px)",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                filter:
                  "invert(1) grayscale(1) brightness(0.9) contrast(0.85)",
              }}
            >
              <GoogleLogin
                onSuccess={(res) => {
                  if (res.credential) handleGoogle(res.credential);
                }}
                onError={() => setError("Google sign-in failed.")}
                theme="filled_black"
                shape="square"
                text="continue_with"
                width="100%"
              />
            </div>
          </div>

          {/* Register link */}
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(11px, 0.72vw, 13px)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--text-dimmer)",
              textAlign: "center",
              marginTop: "clamp(24px, 2.4vw, 40px)",
            }}
          >
            No account?{" "}
            <Link
              href="/register"
              style={{
                color: "var(--text)",
                textDecoration: "underline",
                textUnderlineOffset: "4px",
                textDecorationThickness: "1px",
              }}
            >
              Create one
            </Link>
          </p>
        </div>
      </main>

      {/* ── Legal footer ────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--line)",
          padding: "clamp(16px, 1.6vw, 28px) var(--gutter)",
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
          By signing in you accept our{" "}
          <a
            href="#"
            style={{
              color: "var(--text)",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
              textDecorationThickness: "1px",
            }}
          >
            Privacy Notice
          </a>{" "}
          and{" "}
          <a
            href="#"
            style={{
              color: "var(--text)",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
              textDecorationThickness: "1px",
            }}
          >
            Terms of Service
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
