"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  useParticipants,
  useLocalParticipant,
  useTracks,
  VideoTrack,
  AudioTrack,
  useRoomInfo,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import {
  Track,
  RoomEvent,
  Participant,
  DataPacket_Kind,
} from "livekit-client";
import { getToken, rooms as roomsApi } from "@/lib/api";
import { Mic, MicOff, Video, VideoOff, ScreenShare, PhoneOff, BotOff } from "lucide-react";

/* ═══════════════════════════════════════
   TYPES
═══════════════════════════════════════ */
interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  ts: number;
}

interface SpeakingStats {
  [identity: string]: { name: string; seconds: number };
}

/* ═══════════════════════════════════════
   PAGE WRAPPER — fetches LK token
═══════════════════════════════════════ */
export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>("");
  const [roomName, setRoomName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    async function fetchToken() {
      try {
        // 1. Join the room first (adds membership if not already a member)
        await roomsApi.join(code).catch(() => {
          // Silently ignore — user is likely already a member
        });

        // 2. Get LiveKit token; backend expects { roomId } in body
        const { data } = await roomsApi.token(code);
        const d = data as { token: string; serverUrl: string; roomName: string };
        setToken(d.token);
        setServerUrl(
          d.serverUrl ??
            process.env.NEXT_PUBLIC_LIVEKIT_URL ??
            "wss://your-livekit-server.com"
        );
        setRoomName(d.roomName ?? code);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string; error?: string } } };
        const msg =
          e?.response?.data?.message ??
          e?.response?.data?.error ??
          "Failed to join room.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    fetchToken();
  }, [code]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} onBack={() => router.push("/dashboard")} />;
  if (!token) return null;

  return (
    <div
      style={{
        height: "100svh",
        background: "var(--bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio
        video={false}
        onDisconnected={() => router.push("/dashboard")}
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <RoomUI code={code} roomName={roomName} />
      </LiveKitRoom>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN ROOM UI — inside LiveKitRoom context
═══════════════════════════════════════ */
function RoomUI({ code, roomName }: { code: string; roomName: string }) {
  const router = useRouter();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const info = useRoomInfo();

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [speakingStats, setSpeakingStats] = useState<SpeakingStats>({});
  const [activeTab, setActiveTab] = useState<"transcript" | "stats">("transcript");
  const [aiMuted, setAiMuted] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  /* ── Track speaking time ────────────────────────────────────── */
  const speakingTimers = useRef<Record<string, number>>({});

  const handleSpeakingChange = useCallback(
    (identity: string, name: string, speaking: boolean) => {
      if (speaking) {
        speakingTimers.current[identity] = Date.now();
      } else {
        const start = speakingTimers.current[identity];
        if (start) {
          const elapsed = (Date.now() - start) / 1000;
          setSpeakingStats((prev) => ({
            ...prev,
            [identity]: {
              name: name || identity,
              seconds: (prev[identity]?.seconds ?? 0) + elapsed,
            },
          }));
          delete speakingTimers.current[identity];
        }
      }
    },
    []
  );

  /* ── LiveKit data messages (transcript from agent) ──────────── */
  useEffect(() => {
    const room = info;
    if (!room) return;
    // @ts-expect-error room object access
    const lkRoom = info?.room;
    if (!lkRoom) return;

    function onData(payload: Uint8Array, participant?: Participant) {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "transcript") {
          setTranscript((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random()}`,
              speaker: msg.speaker ?? participant?.identity ?? "Unknown",
              text: msg.text,
              ts: Date.now(),
            },
          ]);
        }
      } catch {
        /* ignore malformed */
      }
    }

    lkRoom.on(RoomEvent.DataReceived, onData);
    return () => lkRoom.off(RoomEvent.DataReceived, onData);
  }, [info]);

  /* ── Auto-scroll transcript ─────────────────────────────────── */
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  /* ── Controls ───────────────────────────────────────────────── */
  async function toggleMic() {
    await localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn((v) => !v);
  }

  async function toggleCam() {
    await localParticipant.setCameraEnabled(!camOn);
    setCamOn((v) => !v);
  }

  async function toggleScreen() {
    await localParticipant.setScreenShareEnabled(
      !localParticipant.isScreenShareEnabled
    );
  }

  function leaveRoom() {
    router.push("/dashboard");
  }

  /* ── Stats summary ──────────────────────────────────────────── */
  const totalSeconds = Object.values(speakingStats).reduce(
    (sum, s) => sum + s.seconds,
    0
  );

  /* ── Identify AI participant ────────────────────────────────── */
  const aiParticipant = participants.find(
    (p) => p.identity?.includes("agent") || p.identity?.includes("lexis-ai")
  );

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Renders ALL remote audio tracks automatically — including the AI agent */}
      <RoomAudioRenderer />
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--line)",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(16px)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 200,
              fontSize: "18px",
              letterSpacing: "0.14em",
            }}
          >
            LEXIS
          </span>
          <span
            style={{
              width: "1px",
              height: "16px",
              background: "var(--line-strong)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
            }}
          >
            {roomName}
          </span>
          <span className="chip" style={{ fontSize: "10px", padding: "5px 8px" }}>
            {code}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {/* Live indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                background: "#22c55e",
                borderRadius: "50%",
                animation: "speak-pulse 2s ease infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--text-dim)",
              }}
            >
              Live · {participants.length} participant{participants.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* ── Center stage ────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            padding: "24px",
            gap: "16px",
          }}
        >
          {/* Participant grid */}
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
              gap: "12px",
              alignContent: "start",
              overflowY: "auto",
            }}
          >
            {/* AI participant card */}
            {aiParticipant ? (
              <AIParticipantCard participant={aiParticipant} muted={aiMuted} />
            ) : (
              <AIPlaceholderCard />
            )}

            {/* Human participants */}
            {participants
              .filter(
                (p) =>
                  !p.identity?.includes("agent") &&
                  !p.identity?.includes("lexis-ai")
              )
              .map((p) => (
                <ParticipantCard
                  key={p.identity}
                  participant={p}
                  onSpeakingChange={handleSpeakingChange}
                />
              ))}
          </div>

          {/* ── Control bar ─────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px",
              borderTop: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            <ControlBtn
              active={micOn}
              onClick={toggleMic}
              label={micOn ? "Mute mic" : "Unmute mic"}
              activeIcon={<Mic size={18} />}
              inactiveIcon={<MicOff size={18} />}
            />
            <ControlBtn
              active={camOn}
              onClick={toggleCam}
              label={camOn ? "Disable camera" : "Enable camera"}
              activeIcon={<Video size={18} />}
              inactiveIcon={<VideoOff size={18} />}
            />
            <ControlBtn
              active={localParticipant.isScreenShareEnabled}
              onClick={toggleScreen}
              label="Share screen"
              activeIcon={<ScreenShare size={18} />}
              inactiveIcon={<ScreenShare size={18} />}
            />
            <ControlBtn
              active={!aiMuted}
              onClick={() => setAiMuted((v) => !v)}
              label={aiMuted ? "Unmute AI" : "Mute AI"}
              activeIcon={<BotOff size={18} />}
              inactiveIcon={<BotOff size={18} />}
              style={{ opacity: aiMuted ? 0.4 : 1 }}
            />

            {/* Spacer */}
            <div
              style={{
                width: "1px",
                height: "24px",
                background: "var(--line-strong)",
                margin: "0 8px",
              }}
            />

            {/* Leave */}
            <button
              onClick={leaveRoom}
              className="btn btn--danger btn--sm"
              aria-label="Leave call"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <PhoneOff size={14} />
              Leave
            </button>
          </div>
        </div>

        {/* ── Right sidebar ────────────────────────────────────── */}
        <div
          style={{
            width: "320px",
            borderLeft: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            {(["transcript", "stats"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "12px 8px",
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    activeTab === tab
                      ? "1px solid var(--text)"
                      : "1px solid transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: activeTab === tab ? "var(--text)" : "var(--text-dimmer)",
                  transition: "color 0.2s ease",
                  marginBottom: "-1px",
                }}
              >
                {tab === "transcript" ? "Transcript" : "Speaking Stats"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "transcript" ? (
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 0",
              }}
            >
              {transcript.length === 0 ? (
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    letterSpacing: "0.12em",
                    color: "var(--text-dimmer)",
                    textAlign: "center",
                    padding: "32px 16px",
                    textTransform: "uppercase",
                  }}
                >
                  Transcript will appear here…
                </p>
              ) : (
                <>
                  {transcript.map((entry) => (
                    <div key={entry.id} className="transcript-bubble">
                      <p className="transcript-bubble__name">{entry.speaker}</p>
                      <p className="transcript-bubble__text">{entry.text}</p>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px",
              }}
            >
              {Object.keys(speakingStats).length === 0 ? (
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    letterSpacing: "0.12em",
                    color: "var(--text-dimmer)",
                    textAlign: "center",
                    paddingTop: "32px",
                    textTransform: "uppercase",
                  }}
                >
                  Tracking speaking time…
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {Object.entries(speakingStats)
                    .sort(([, a], [, b]) => b.seconds - a.seconds)
                    .map(([identity, stat]) => {
                      const pct =
                        totalSeconds > 0
                          ? Math.round((stat.seconds / totalSeconds) * 100)
                          : 0;
                      return (
                        <div key={identity}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "6px",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                color: "var(--text-dim)",
                              }}
                            >
                              {stat.name}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: "var(--text-dimmer)",
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   PARTICIPANT CARD
═══════════════════════════════════════ */
function ParticipantCard({
  participant,
  onSpeakingChange,
}: {
  participant: Participant;
  onSpeakingChange: (id: string, name: string, speaking: boolean) => void;
}) {
  const [speaking, setSpeaking] = useState(false);
  const videoTracks = useTracks([Track.Source.Camera]);
  const hasVideo = videoTracks.length > 0;

  useEffect(() => {
    function onSpeak() {
      setSpeaking(true);
      onSpeakingChange(
        participant.identity,
        participant.name ?? participant.identity,
        true
      );
    }
    function onSilence() {
      setSpeaking(false);
      onSpeakingChange(
        participant.identity,
        participant.name ?? participant.identity,
        false
      );
    }
    participant.on("isSpeakingChanged", (s: boolean) =>
      s ? onSpeak() : onSilence()
    );
    return () => {
      participant.off("isSpeakingChanged", (s: boolean) =>
        s ? onSpeak() : onSilence()
      );
    };
  }, [participant]);

  return (
    <div
      style={{
        aspectRatio: "4/3",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${speaking ? "rgba(255,255,255,0.4)" : "var(--line)"}`,
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.2s ease",
        ...(speaking && { boxShadow: "0 0 0 3px rgba(255,255,255,0.08)" }),
      }}
      className={speaking ? "speaking-pulse" : ""}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={videoTracks[0]}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {/* Avatar initials */}
          <div
            style={{
              width: "52px",
              height: "52px",
              background: "var(--fill-solid)",
              border: "1px solid var(--line-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 200,
              fontSize: "20px",
              letterSpacing: "0.08em",
              color: "var(--text-dim)",
            }}
          >
            {(participant.name ?? participant.identity)?.[0]?.toUpperCase() ??
              "?"}
          </div>
          {speaking && (
            <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="wave-bar" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Name tag */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "8px 10px",
          background:
            "linear-gradient(transparent, rgba(0,0,0,0.7))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
          }}
        >
          {participant.name ?? participant.identity}
        </span>
        {speaking && (
          <span
            style={{
              width: "6px",
              height: "6px",
              background: "#22c55e",
              borderRadius: "50%",
            }}
          />
        )}
      </div>

      {/* Audio track (render but invisible) */}
      {participant.audioTrackPublications.size > 0 &&
        [...participant.audioTrackPublications.values()].map((pub) =>
          pub.track ? (
            <AudioTrack
              key={pub.trackSid}
              trackRef={{ participant, publication: pub, source: Track.Source.Microphone }}
            />
          ) : null
        )}
    </div>
  );
}

/* ═══════════════════════════════════════
   AI PARTICIPANT CARD
═══════════════════════════════════════ */
function AIParticipantCard({
  participant,
  muted,
}: {
  participant: Participant;
  muted: boolean;
}) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    participant.on("isSpeakingChanged", (s: boolean) => setSpeaking(s));
    return () => {
      participant.off("isSpeakingChanged", (_s: boolean) => {});
    };
  }, [participant]);

  return (
    <div
      style={{
        aspectRatio: "4/3",
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${speaking ? "rgba(255,255,255,0.35)" : "var(--line)"}`,
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.3s ease",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {/* AI icon */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "28px",
            fontWeight: 200,
            letterSpacing: "0.1em",
            color: speaking ? "var(--text)" : "var(--text-dim)",
            transition: "color 0.3s ease",
          }}
        >
          AI
        </div>

        {/* Wave visualizer when speaking */}
        {speaking && !muted && (
          <div
            style={{
              display: "flex",
              gap: "3px",
              alignItems: "center",
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="wave-bar" />
            ))}
          </div>
        )}

        {muted && (
          <span
            className="chip"
            style={{ fontSize: "9px", padding: "4px 8px" }}
          >
            Muted
          </span>
        )}
      </div>

      {/* Name tag */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "8px 10px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
          }}
        >
          Lexis AI
        </span>
      </div>
    </div>
  );
}

function AIPlaceholderCard() {
  return (
    <div
      style={{
        aspectRatio: "4/3",
        background: "rgba(255,255,255,0.01)",
        border: "1px dashed var(--line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "24px",
          fontWeight: 200,
          color: "var(--text-dimmer)",
        }}
      >
        AI
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-dimmer)",
        }}
      >
        Waiting…
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════
   CONTROL BUTTON
═══════════════════════════════════════ */
function ControlBtn({
  active,
  onClick,
  label,
  activeIcon,
  inactiveIcon,
  style: extraStyle,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: "44px",
        height: "44px",
        background: active ? "var(--fill-solid)" : "var(--fill-ghost)",
        border: "1px solid var(--line-strong)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: active ? "var(--text)" : "var(--text-dim)",
        transition: "background 0.2s ease, color 0.2s ease",
        ...extraStyle,
      }}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  );
}

/* ═══════════════════════════════════════
   LOADING / ERROR SCREENS
═══════════════════════════════════════ */
function LoadingScreen() {
  return (
    <div
      style={{
        height: "100svh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 200,
          fontSize: "clamp(28px, 3vw, 48px)",
          letterSpacing: "0.1em",
        }}
      >
        LEXIS
      </span>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--text-dim)",
        }}
      >
        Connecting…
      </p>
      <div style={{ display: "flex", gap: "3px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="wave-bar" />
        ))}
      </div>
    </div>
  );
}

function ErrorScreen({
  error,
  onBack,
}: {
  error: string;
  onBack: () => void;
}) {
  return (
    <div
      style={{
        height: "100svh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "20px",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <span className="chip">[ Error ]</span>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "rgba(248, 113, 113, 0.9)",
          maxWidth: "400px",
        }}
      >
        {error}
      </p>
      <button onClick={onBack} className="btn btn--ghost">
        Back to Dashboard
      </button>
    </div>
  );
}
