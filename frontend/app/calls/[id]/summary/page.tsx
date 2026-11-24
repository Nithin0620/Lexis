"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, calls as callsApi } from "@/lib/api";

/* ── Types ──────────────────────────────────────────────────────── */
interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  dueDate?: string;
  done: boolean;
}

interface Decision {
  id: string;
  text: string;
}

interface ParticipantStat {
  id: string;
  name: string;
  speakingSeconds: number;
  wordsSpoken: number;
  aiInteractions: number;
  topContributions?: string[];
}

interface CallData {
  id: string;
  code: string;
  roomName: string;
  startedAt: string;
  endedAt?: string;
  duration?: number;
  status: string;
  summary?: {
    overview?: string;
    keyDecisions?: Decision[];
    actionItems?: ActionItem[];
    rawMarkdown?: string;
  };
  participants: ParticipantStat[];
}

function fmt_duration(s?: number): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmt_date(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function total_secs(ps: ParticipantStat[]): number {
  return ps.reduce((n, p) => n + (p.speakingSeconds ?? 0), 0);
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════ */
export default function SummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    callsApi.get(id)
      .then(({ data: res }) => {
        const d = res as CallData;
        setData(d);
        const init: Record<string, boolean> = {};
        (d.summary?.actionItems ?? []).forEach((it) => { init[it.id] = it.done ?? false; });
        setChecked(init);
      })
      .catch(() => setError("Could not load meeting summary."))
      .finally(() => setLoading(false));
  }, [id]);

  function copyMarkdown() {
    if (!data) return;
    const lines: string[] = [
      `# ${data.roomName ?? data.code} — Meeting Summary`,
      `**Date:** ${fmt_date(data.startedAt)}   **Duration:** ${fmt_duration(data.duration)}   **Participants:** ${data.participants.length}`,
      "",
    ];
    if (data.summary?.overview) lines.push("## Executive Summary", "", data.summary.overview, "");
    if (data.summary?.keyDecisions?.length) {
      lines.push("## Key Decisions", "");
      data.summary.keyDecisions.forEach((d, i) => lines.push(`${i + 1}. ${d.text}`));
      lines.push("");
    }
    if (data.summary?.actionItems?.length) {
      lines.push("## Action Items", "");
      data.summary.actionItems.forEach((it) => {
        const box = checked[it.id] ? "[x]" : "[ ]";
        lines.push(`- ${box} ${it.text}${it.assignee ? ` · ${it.assignee}` : ""}${it.dueDate ? ` · Due: ${it.dueDate}` : ""}`);
      });
      lines.push("");
    }
    const tot = total_secs(data.participants);
    if (data.participants.length) {
      lines.push("## Participants", "");
      data.participants.forEach((p) => {
        const pct = tot > 0 ? Math.round((p.speakingSeconds / tot) * 100) : 0;
        lines.push(`### ${p.name}`, `- ${fmt_duration(p.speakingSeconds)} (${pct}%) · ${(p.wordsSpoken ?? 0).toLocaleString()} words`, "");
      });
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /* ── Loading ────────────────────────────────────────────────── */
  if (loading) return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"20px" }}>
      <span style={{ fontFamily:"var(--font-display)", fontWeight:200, fontSize:"clamp(28px,3vw,44px)", letterSpacing:"0.1em" }}>LEXIS</span>
      <p style={{ fontFamily:"var(--font-mono)", fontSize:"12px", letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--text-dim)" }}>Loading summary…</p>
      <div style={{ display:"flex", gap:"3px" }}>
        {[0,1,2,3,4].map(i => <div key={i} className="wave-bar" />)}
      </div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"20px", padding:"24px", textAlign:"center" }}>
      <span className="chip">[ Error ]</span>
      <p style={{ fontFamily:"var(--font-mono)", fontSize:"13px", color:"rgba(248,113,113,0.9)" }}>{error || "Summary not found."}</p>
      <Link href="/dashboard" className="btn btn--ghost">Back to Dashboard</Link>
    </div>
  );

  const { summary, participants } = data;
  const decisions = summary?.keyDecisions ?? [];
  const actionItems = summary?.actionItems ?? [];
  const tot = total_secs(participants);

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", flexDirection:"column" }}>

      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="lexis-nav">
        <Link href="/dashboard" className="lexis-nav__logo">LEXIS</Link>
        <div className="lexis-nav__links">
          <Link href="/dashboard" className="lexis-nav__link">Dashboard</Link>
        </div>
      </nav>

      {/* ── Main ───────────────────────────────────────────── */}
      <main
        className="fade-in-up"
        style={{ flex:1, padding:"clamp(32px,4vw,64px) var(--gutter)", maxWidth:"900px", width:"100%", margin:"0 auto" }}
      >

        {/* Page header */}
        <div style={{ marginBottom:"clamp(32px,4vw,56px)" }}>
          <div className="chip" style={{ marginBottom:"16px" }}>[ Meeting Summary ]</div>

          <h1 style={{ fontFamily:"var(--font-display)", fontWeight:200, fontSize:"clamp(28px,3.5vw,52px)", letterSpacing:"0.04em", lineHeight:1, marginBottom:"clamp(16px,2vw,28px)" }}>
            {data.roomName ?? data.code}
          </h1>

          {/* Meta row */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:"24px", marginBottom:"24px" }}>
            <MetaItem label="Date"         value={fmt_date(data.startedAt)} />
            <MetaItem label="Duration"     value={fmt_duration(data.duration)} />
            <MetaItem label="Participants" value={String(participants.length)} />
            <MetaItem label="Status"       value={data.status?.toUpperCase() ?? "—"} />
          </div>

          {/* Action buttons */}
          <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
            <button onClick={copyMarkdown} className="btn btn--ghost btn--sm">
              {copied ? "✓ Copied!" : "Copy Markdown"}
            </button>
            <button onClick={() => window.print()} className="btn btn--ghost btn--sm">
              Download PDF
            </button>
          </div>
        </div>

        <div className="divider" style={{ marginBottom:"clamp(32px,4vw,52px)" }} />

        {/* ── Executive Summary ──────────────────────────── */}
        {summary?.overview && (
          <SummarySection label="Executive Summary">
            <div style={{ padding:"clamp(20px,2.4vw,32px)", border:"1px solid var(--line)", background:"var(--fill-ghost)" }}>
              <p style={{ fontFamily:"var(--font-display)", fontSize:"clamp(14px,1.1vw,16px)", color:"var(--text-dim)", lineHeight:1.7 }}>
                {summary.overview}
              </p>
            </div>
          </SummarySection>
        )}

        {/* ── Key Decisions ──────────────────────────────── */}
        {decisions.length > 0 && (
          <SummarySection label="Key Decisions">
            <div style={{ border:"1px solid var(--line)" }}>
              {decisions.map((d, i) => (
                <div key={d.id ?? i} style={{
                  display:"flex", alignItems:"flex-start", gap:"14px",
                  padding:"16px 20px",
                  borderBottom: i < decisions.length - 1 ? "1px solid var(--line)" : "none",
                }}>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-dimmer)", letterSpacing:"0.1em", paddingTop:"2px", flexShrink:0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p style={{ fontFamily:"var(--font-display)", fontSize:"14px", color:"var(--text-dim)", lineHeight:1.5 }}>{d.text}</p>
                </div>
              ))}
            </div>
          </SummarySection>
        )}

        {/* ── Action Items ───────────────────────────────── */}
        {actionItems.length > 0 && (
          <SummarySection label="Action Items">
            <div style={{ border:"1px solid var(--line)" }}>
              {/* Header row */}
              <div style={{ display:"grid", gridTemplateColumns:"32px 1fr 150px 110px", padding:"10px 20px", borderBottom:"1px solid var(--line)", gap:"16px" }}>
                {["", "Task", "Assignee", "Due"].map((h) => (
                  <span key={h} style={{ fontFamily:"var(--font-mono)", fontSize:"10px", letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--text-dimmer)" }}>{h}</span>
                ))}
              </div>

              {actionItems.map((item, i) => (
                <div key={item.id ?? i} style={{
                  display:"grid", gridTemplateColumns:"32px 1fr 150px 110px",
                  padding:"14px 20px", gap:"16px", alignItems:"center",
                  borderBottom: i < actionItems.length - 1 ? "1px solid var(--line)" : "none",
                  background: checked[item.id] ? "var(--fill-ghost)" : "transparent",
                  transition:"background 0.2s ease",
                }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => setChecked(p => ({ ...p, [item.id]: !p[item.id] }))}
                    aria-label="Toggle done"
                    style={{ width:"18px", height:"18px", background: checked[item.id] ? "rgba(255,255,255,0.3)" : "transparent", border:"1px solid var(--line-strong)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.2s ease", flexShrink:0 }}
                  >
                    {checked[item.id] && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="square"/>
                      </svg>
                    )}
                  </button>

                  <p style={{ fontFamily:"var(--font-display)", fontSize:"13px", color: checked[item.id] ? "var(--text-dimmer)" : "var(--text-dim)", textDecoration: checked[item.id] ? "line-through" : "none", lineHeight:1.4, transition:"color 0.2s ease" }}>
                    {item.text}
                  </p>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-dimmer)", letterSpacing:"0.08em" }}>{item.assignee ?? "—"}</span>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", color:"var(--text-dimmer)", letterSpacing:"0.08em" }}>{item.dueDate ?? "—"}</span>
                </div>
              ))}
            </div>
          </SummarySection>
        )}

        {/* ── Participant Breakdown ──────────────────────── */}
        {participants.length > 0 && (
          <SummarySection label="Participant Contributions">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px,1fr))", gap:"1px", background:"var(--line)", border:"1px solid var(--line)" }}>
              {participants.map((p) => {
                const pct = tot > 0 ? Math.round((p.speakingSeconds / tot) * 100) : 0;
                return <ParticipantCard key={p.id} p={p} pct={pct} />;
              })}
            </div>
          </SummarySection>
        )}

        {/* ── Raw transcript (collapsible) ───────────────── */}
        {summary?.rawMarkdown && (
          <SummarySection label="Full Transcript">
            <details style={{ border:"1px solid var(--line)" }}>
              <summary style={{ padding:"14px 20px", fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--text-dim)", cursor:"pointer", listStyle:"none", display:"flex", alignItems:"center", justifyContent:"space-between", userSelect:"none" }}>
                Show Raw Transcript <span>↓</span>
              </summary>
              <pre style={{ padding:"20px", fontFamily:"var(--font-mono)", fontSize:"12px", color:"var(--text-dim)", overflowX:"auto", whiteSpace:"pre-wrap", borderTop:"1px solid var(--line)", lineHeight:1.6 }}>
                {summary.rawMarkdown}
              </pre>
            </details>
          </SummarySection>
        )}

        <div style={{ height:"clamp(32px,4vw,64px)" }} />
      </main>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */
function SummarySection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom:"clamp(32px,4vw,52px)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"16px", marginBottom:"16px" }}>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"0.22em", textTransform:"uppercase", color:"var(--text-dimmer)", whiteSpace:"nowrap" }}>
          {label}
        </span>
        <div style={{ flex:1, height:"1px", background:"var(--line)" }} />
      </div>
      {children}
    </section>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontFamily:"var(--font-mono)", fontSize:"10px", letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--text-dimmer)", marginBottom:"4px" }}>{label}</p>
      <p style={{ fontFamily:"var(--font-display)", fontWeight:300, fontSize:"14px", color:"var(--text-dim)" }}>{value}</p>
    </div>
  );
}

function ParticipantCard({ p, pct }: { p: ParticipantStat; pct: number }) {
  return (
    <div style={{ background:"var(--bg)", padding:"clamp(16px,2vw,28px)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
        <div style={{ width:"32px", height:"32px", background:"var(--fill-solid)", border:"1px solid var(--line-strong)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-display)", fontWeight:200, fontSize:"14px", flexShrink:0 }}>
          {p.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <p style={{ fontFamily:"var(--font-display)", fontWeight:300, fontSize:"14px", color:"var(--text)" }}>{p.name}</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"14px" }}>
        <MiniStat label="Words"      value={(p.wordsSpoken ?? 0).toLocaleString()} />
        <MiniStat label="Talk time"  value={`${pct}%`} />
        <MiniStat label="Speaking"   value={fmt_duration(p.speakingSeconds)} />
        <MiniStat label="AI queries" value={String(p.aiInteractions ?? 0)} />
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width:`${pct}%` }} />
      </div>

      {p.topContributions?.slice(0, 2).map((c, i) => (
        <p key={i} style={{ fontFamily:"var(--font-display)", fontSize:"12px", color:"var(--text-dimmer)", lineHeight:1.4, marginTop:"6px" }}>· {c}</p>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontFamily:"var(--font-mono)", fontSize:"9px", letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--text-dimmer)", marginBottom:"2px" }}>{label}</p>
      <p style={{ fontFamily:"var(--font-display)", fontWeight:200, fontSize:"16px", color:"var(--text-dim)", letterSpacing:"0.02em" }}>{value}</p>
    </div>
  );
}
