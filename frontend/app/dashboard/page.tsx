"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getUser, clearToken, analytics, rooms } from "@/lib/api";

/* ── Types ──────────────────────────────────────────────────────── */
interface Stats {
  totalMeetings: number;
  totalSpeakingSeconds: number;
  totalWordsSpoken: number;
  totalAIInteractions: number;
  recentCalls: RecentCall[];
}

interface RecentCall {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  duration?: number;
}

interface Room {
  id: string;
  code: string;
  name: string;
  aiEnabled: boolean;
  createdAt: string;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ═══════════════════════════════════════
   DASHBOARD PAGE
═══════════════════════════════════════ */
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [roomList, setRoomList] = useState<Room[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);

  /* modal state */
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createAI, setCreateAI] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  /* join state */
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  /* ── Auth guard ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    setUser(getUser());
    fetchStats();
    fetchRooms();
  }, []);

  async function fetchStats() {
    setStatsLoading(true);
    try {
      const { data } = await analytics.me();
      setStats(data as Stats);
    } catch {
      /* non-critical — show zeros */
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchRooms() {
    setRoomsLoading(true);
    try {
      const { data } = await rooms.list();
      setRoomList((data as { rooms: Room[] }).rooms ?? []);
    } catch {
      /* ignore */
    } finally {
      setRoomsLoading(false);
    }
  }

  /* ── Create room ────────────────────────────────────────────── */
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError("Room name is required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const { data } = await rooms.create(
        createName.trim(),
        createPrompt.trim() || undefined,
        createAI
      );
      setShowCreate(false);
      setCreateName("");
      setCreatePrompt("");
      setCreateAI(true);
      router.push(`/room/${(data as { room: { code: string } }).room.code}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to create room.";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  /* ── Join room ──────────────────────────────────────────────── */
  function handleJoin(e: FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter a room code.");
      return;
    }
    router.push(`/room/${code}`);
  }

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  const displayName =
    (user?.name as string) ?? (user?.email as string) ?? "User";

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Navbar ──────────────────────────────────────────────── */}
      <nav className="lexis-nav">
        <span className="lexis-nav__logo">LEXIS</span>
        <div className="lexis-nav__links">
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              letterSpacing: "0.14em",
              color: "var(--text-dimmer)",
              textTransform: "uppercase",
            }}
          >
            {displayName}
          </span>
          <button
            onClick={handleLogout}
            className="btn btn--ghost btn--sm"
            style={{ cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Main content ────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          padding: "clamp(32px, 4vw, 64px) var(--gutter)",
          maxWidth: "1200px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* Page title */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "clamp(32px, 4vw, 56px)",
          }}
        >
          <div>
            <div className="chip" style={{ marginBottom: "16px" }}>
              [ Dashboard ]
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 200,
                fontSize: "clamp(32px, 3.5vw, 56px)",
                letterSpacing: "0.04em",
                lineHeight: 0.95,
              }}
            >
              Welcome back.
            </h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="btn btn--solid"
          >
            + New Room
          </button>
        </div>

        {/* ── Analytics Banner ──────────────────────────────────── */}
        <section
          style={{
            marginBottom: "clamp(40px, 5vw, 72px)",
          }}
        >
          <SectionLabel label="Lifetime Stats" />
          {statsLoading ? (
            <SkeletonRow />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "1px",
                background: "var(--line)",
                border: "1px solid var(--line)",
                marginTop: "16px",
              }}
            >
              <StatCard
                label="Meetings"
                value={String(stats?.totalMeetings ?? 0)}
              />
              <StatCard
                label="Speaking Time"
                value={formatTime(stats?.totalSpeakingSeconds ?? 0)}
              />
              <StatCard
                label="Words Spoken"
                value={(stats?.totalWordsSpoken ?? 0).toLocaleString()}
              />
              <StatCard
                label="AI Queries"
                value={String(stats?.totalAIInteractions ?? 0)}
              />
            </div>
          )}
        </section>

        {/* ── Join Room ─────────────────────────────────────────── */}
        <section style={{ marginBottom: "clamp(40px, 5vw, 72px)" }}>
          <SectionLabel label="Quick Join" />
          <form
            onSubmit={handleJoin}
            noValidate
            style={{
              marginTop: "16px",
              display: "flex",
              gap: "0",
              alignItems: "stretch",
            }}
          >
            <input
              type="text"
              className="input-field"
              placeholder="Room code (e.g. LEX-449-C8DC)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={{
                flex: 1,
                borderBottom: "1px solid var(--line-strong)",
                borderRight: "none",
                paddingBottom: "14px",
              }}
            />
            <button
              type="submit"
              className="btn btn--ghost"
              style={{ borderLeft: "none", paddingLeft: "24px", paddingRight: "24px" }}
            >
              Join
            </button>
          </form>
          {joinError && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "rgba(248, 113, 113, 0.9)",
                marginTop: "8px",
              }}
            >
              {joinError}
            </p>
          )}
        </section>

        {/* ── My Rooms ──────────────────────────────────────────── */}
        <section>
          <SectionLabel label="My Rooms" />
          <div style={{ marginTop: "16px" }}>
            {roomsLoading ? (
              <SkeletonRow />
            ) : roomList.length === 0 ? (
              <EmptyState
                message="No rooms yet."
                cta="Create your first room"
                onCta={() => setShowCreate(true)}
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "1px",
                  background: "var(--line)",
                }}
              >
                {roomList.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onStart={() => router.push(`/room/${room.code}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Recent Calls ──────────────────────────────────────── */}
        {stats?.recentCalls && stats.recentCalls.length > 0 && (
          <section style={{ marginTop: "clamp(40px, 5vw, 72px)" }}>
            <SectionLabel label="Recent Calls" />
            <div
              style={{
                marginTop: "16px",
                border: "1px solid var(--line)",
              }}
            >
              {stats.recentCalls.map((call, i) => (
                <RecentCallRow
                  key={call.id}
                  call={call}
                  isLast={i === stats.recentCalls.length - 1}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── Create Room Modal ────────────────────────────────────── */}
      {showCreate && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div className="modal-box fade-in-up">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "32px",
              }}
            >
              <span className="chip">[ New Room ]</span>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "18px",
                  lineHeight: 1,
                  padding: "4px",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 200,
                fontSize: "clamp(28px, 3vw, 44px)",
                letterSpacing: "0.04em",
                marginBottom: "clamp(24px, 3vw, 40px)",
              }}
            >
              Create Room
            </h2>

            <form
              onSubmit={handleCreate}
              noValidate
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "clamp(16px, 2vw, 28px)",
              }}
            >
              <div>
                <label
                  htmlFor="roomName"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--text-dimmer)",
                    display: "block",
                    marginBottom: "10px",
                  }}
                >
                  Room Name
                </label>
                <input
                  id="roomName"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Product Sync"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="aiPrompt"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--text-dimmer)",
                    display: "block",
                    marginBottom: "10px",
                  }}
                >
                  Custom AI Prompt{" "}
                  <span style={{ color: "var(--text-dimmer)", fontWeight: 300 }}>
                    (optional)
                  </span>
                </label>
                <textarea
                  id="aiPrompt"
                  className="input-field"
                  placeholder="e.g. Focus on action items and blockers…"
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  rows={3}
                  style={{
                    resize: "vertical",
                    paddingBottom: "12px",
                    paddingTop: "4px",
                  }}
                />
              </div>

              {/* AI toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px",
                  border: "1px solid var(--line)",
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--text-dim)",
                    }}
                  >
                    Lexis AI
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "12px",
                      color: "var(--text-dimmer)",
                      marginTop: "4px",
                    }}
                  >
                    Real-time AI assistant in the room
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateAI((v) => !v)}
                  style={{
                    width: "48px",
                    height: "24px",
                    background: createAI
                      ? "rgba(255,255,255,0.3)"
                      : "var(--fill-ghost)",
                    border: "1px solid var(--line-strong)",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.25s ease",
                  }}
                  aria-pressed={createAI}
                  aria-label="Toggle AI"
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "3px",
                      left: createAI ? "26px" : "3px",
                      width: "16px",
                      height: "16px",
                      background: "var(--text)",
                      transition: "left 0.25s ease",
                    }}
                  />
                </button>
              </div>

              {createError && (
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "rgba(248, 113, 113, 0.9)",
                  }}
                >
                  {createError}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginTop: "8px",
                }}
              >
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--solid"
                  style={{ flex: 1 }}
                  disabled={creating}
                >
                  {creating ? "Creating…" : "Create & Enter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════ */
function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--text-dimmer)",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--line)" }} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "clamp(20px, 2.4vw, 36px) clamp(20px, 2vw, 32px)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--text-dimmer)",
          marginBottom: "10px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 200,
          fontSize: "clamp(28px, 3vw, 44px)",
          letterSpacing: "0.02em",
          lineHeight: 1,
          color: "var(--text)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function RoomCard({ room, onStart }: { room: Room; onStart: () => void }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "clamp(20px, 2vw, 32px)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}
      >
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 300,
              fontSize: "16px",
              color: "var(--text)",
              marginBottom: "4px",
            }}
          >
            {room.name}
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: "0.14em",
              color: "var(--text-dimmer)",
            }}
          >
            {room.code}
          </p>
        </div>
        {room.aiEnabled && (
          <span
            className="chip"
            style={{ fontSize: "10px", padding: "5px 8px" }}
          >
            AI
          </span>
        )}
      </div>

      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          letterSpacing: "0.1em",
          color: "var(--text-dimmer)",
          textTransform: "uppercase",
        }}
      >
        {new Date(room.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      <button
        onClick={onStart}
        className="btn btn--ghost btn--wide"
        style={{ marginTop: "auto" }}
      >
        Start Call
      </button>
    </div>
  );
}

function RecentCallRow({
  call,
  isLast,
}: {
  call: RecentCall;
  isLast: boolean;
}) {
  return (
    <Link
      href={`/calls/${call.id}/summary`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
        textDecoration: "none",
        transition: "background 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background =
          "var(--fill-ghost)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
      }}
    >
      <div>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "14px",
            color: "var(--text)",
            marginBottom: "3px",
          }}
        >
          {call.name ?? call.code}
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.1em",
            color: "var(--text-dimmer)",
            textTransform: "uppercase",
          }}
        >
          {new Date(call.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
          {call.duration ? `  ·  ${formatTime(call.duration)}` : ""}
        </p>
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-dimmer)",
        }}
      >
        View →
      </span>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        height: "80px",
        background: "var(--fill-ghost)",
        marginTop: "16px",
        animation: "pulse 1.6s ease infinite",
      }}
    />
  );
}

function EmptyState({
  message,
  cta,
  onCta,
}: {
  message: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <div
      style={{
        padding: "clamp(32px, 4vw, 64px)",
        border: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "14px",
          color: "var(--text-dim)",
        }}
      >
        {message}
      </p>
      <button onClick={onCta} className="btn btn--ghost btn--sm">
        {cta}
      </button>
    </div>
  );
}
