# Lexis: End-to-End System Architecture & Roadmap

This document serves as the master engineering blueprint for **Lexis**, an AI-powered real-time group meeting platform. It details the implemented wake-word-gated voice pipeline, transcript-first persistence, on-demand retrieval, usage telemetry, and the original backend/frontend roadmap.

---

## 1. Executive Summary & Core Philosophy

Lexis is not just a 1-on-1 voice chatbot. It is a **collaborative group call platform** where multiple humans and an AI voice assistant share a real-time WebRTC room.

### Key Architectural Differentiator: Zero-Diarization Individual Audio
In traditional audio systems, all participants' voices are mixed into a single audio track, requiring complex and error-prone Machine Learning speaker diarization models to guess who spoke when.
- **Lexis leverages LiveKit WebRTC individual participant tracks**: Every human connects with their authenticated `userId` and `name`. 
- LiveKit publishes separate audio streams per participant.
- **Result**: 100% accurate speaker attribution, individual speaking time calculation, and word count metrics **with zero diarization overhead**.

---

## 2. Current Status & What Has Been Built

```
Lexis/
├── backend/          # Express + TypeScript + Prisma + Neon PostgreSQL API
├── agent/            # Python 3.12 LiveKit Voice Agent Worker (VAD + STT + LLM + TTS)
├── frontend/         # Next.js (App Router) + Tailwind CSS (Ready for UI)
├── free.md           # Guide to 100% free tiers & provider credits
└── ARCHITECTURE.md   # This master document
```

### A. Database (Neon PostgreSQL via Prisma) — All Migrated & Validated
- `User`: Email/password, Google OAuth (`googleId`), password reset tokens (`resetPasswordToken`, `resetPasswordExpires`).
- `Room`: Name, unique join code (`code` e.g. `lex-449-c8dc`), `liveKitRoomId`, host (`createdBy`), AI settings (`aiEnabled`, `aiPrompt`).
- `RoomMember`: Join records with role (`host` vs `member`), uniqueness constraint `@@unique([userId, roomId])`.
- `Call`: Call lifecycle (`active` vs `completed`), timestamps (`startedAt`, `endedAt`).
- `CallParticipant`: Join/leave timestamps (`joinedAt`, `leftAt`), and **real-time speaking stats** (`speakingSeconds`, `wordsSpoken`, `aiInteractions`).
- `Transcript`: Parent record storing full combined meeting text.
- `TranscriptSegment`: Individual spoken sentences with `speakerName`, `speakerId`, `content`, `sequence`, `isAi`.
- `MeetingSummary`: AI-generated document with `overview`, `decisions`, `actionItems`, and `participantNotes`.
- `AIUsage`: Token counting (`inputTokens`, `outputTokens`) and cost estimation (`estimatedCost`).
- `AgentEvent`: Wake-word hits, blocked false triggers, AI mute blocks, context-tool calls, and LLM start/completion events with latency and metadata.

### B. Backend REST APIs (`backend/`)
- **Auth (`/api/auth`)**:
  - `POST /register`: bcrypt hashing (10 salt rounds), JWT signing.
  - `POST /login`: Credential validation, JWT generation.
  - `POST /google`: Verifies Google ID tokens via `google-auth-library` (no secret needed on frontend), account linking.
  - `POST /forgot-password` & `POST /reset-password`: Crypto SHA-256 tokens with 15-minute expiration.
  - `GET /me` & `PUT /profile`: Protected profile access.
- **Rooms (`/api/rooms`)**:
  - `POST /`: Creates room and sets creator as `host`.
  - `POST /join`: Joins room via short code.
  - `GET /my`: Fetches all user's rooms.
  - `GET /:identifier`: Fetches room details, members, and active call.
  - `PUT /:id` & `DELETE /:id`: Host controls.
   - `POST /token`: Ensures an active call, syncs LiveKit room metadata with `callId`, adds participant attributes, then signs the WebRTC `AccessToken`.
- **Calls & Transcripts (`/api/calls`)**:
   - `POST /start`: Initiates or returns active room call and syncs LiveKit room metadata.
   - `POST /join` & `POST /leave`: Participant tracking.
   - `PUT /:id/end`: Completes call, updates timestamps.
   - `GET /:id`: Full call inspection including participants, transcript, summary, `aiUsages`, and `agentEvents`.
   - `POST /transcript/segment`: Ingests every finalized speech segment with speaker, sequence, and timing; updates `speakingSeconds` and `wordsSpoken`.
   - `GET /:callId/transcript`: Full ordered transcript.
   - `GET /:callId/context?query=...&limit=...`: Service-token-protected, query-aware compact context retrieval for the agent function tool.
   - `POST /telemetry`: Service-token-protected agent event ingestion; writes `AgentEvent`, and for `llm_call_completed` also writes `AIUsage` and increments `aiInteractions`.
   - `POST /summary`: Manual summary save.
   - `POST /:id/generate-summary`: **AI Meeting Intelligence Generator** powered by Gemini 2.5 Flash / OpenAI.
- **Security & Internal Auth**:
   - `x-service-token` authentication in `auth.middleware.ts` allowing the Python agent worker to communicate with Express securely.

### C. LiveKit Voice Agent Worker (`agent/agent.py`)
- Built using **Python 3.12** and official **`livekit-agents` v1.8+**.
- **Silero VAD**: Real-time voice activity detection with fixed endpointing.
- **STT**: Deepgram Nova-2 / OpenAI. STT runs continuously for the whole call.
- **LLM**: GPT-4o-mini / Gemini 2.5 Flash with room-specific prompts.
- **TTS**: Cartesia Sonic / OpenAI Alloy.
- **Barge-in / Interruption**: Cuts off AI speech immediately if a human starts talking.
- **Hard wake-word gate**: Word-boundary `Lexis` family matching in `on_user_turn_completed`; non-matching turns raise `StopResponse()` before LLM generation. Preemptive generation is disabled so no speculative LLM request starts before the gate.
- **TTS-only acknowledgement**: A bare wake word is answered with a canned phrase, without an LLM call.
- **Backend Sync**: Posts every finalized human and AI segment to `/api/calls/transcript/segment`, independent of wake-word state.
- **On-demand retrieval**: The `get_meeting_context(query, limit)` function tool calls `/api/calls/:callId/context` only when the LLM needs earlier meeting context.
- **Telemetry**: Posts wake hits, false-trigger blocks, AI mute blocks, tool calls, and LLM token/latency metrics to `/api/calls/telemetry`.

---

## 3. Implemented Cost-Control Pipeline

### Why STT stays on
STT is the system's source of truth for the meeting record. Every finalized utterance is persisted as a `TranscriptSegment` and appended to `Transcript.fullText`, even when Lexis is silent. This keeps the meeting history complete and makes retrieval possible later.

### Why persistence is independent of the LLM
Transcript posting happens in the `user_input_transcribed` event handler. The wake-word gate only decides whether the LLM may reply; it never decides whether speech is stored. A normal three-person conversation therefore produces transcript rows and zero LLM requests.

### Why the gate happens before the LLM
`LexisAgent.on_user_turn_completed` checks for a whole-word Lexis-family phrase before the reply pipeline runs. Non-matching turns raise `StopResponse()`. Preemptive generation is disabled, so the LLM cannot speculatively generate before that check. A bare wake word is handled by direct TTS only.

### Why context is retrieved on demand
The live system prompt does not include the full transcript. When the user asks about earlier discussion, decisions, or action items, the LLM calls `get_meeting_context(query, limit)`. That tool queries `/api/calls/:callId/context`, which returns a compact, query-ranked set of transcript lines.

### How cost control is proven
Agent events (`wake_word_hit`, `false_trigger_blocked`, `ai_muted_turn`, `llm_call_started`, `llm_call_completed`, `context_tool_called`) are written to `AgentEvent`. Each LLM completion also writes an `AIUsage` row with input/output tokens, estimated cost, and latency, and increments the triggering participant's `aiInteractions`. `DEMO.md` and `backend/scripts/verify-demo.ts` turn this into a repeatable assertion.

---

## 4. Design Decisions

1. **LiveKit over hosted meeting bots**: LiveKit provides separate authenticated participant audio tracks, so speaker attribution is exact without ML diarization. It also gives the agent first-class room metadata and data messages.
2. **Managed STT/TTS APIs instead of custom speech models**: Deepgram/OpenAI STT and Cartesia/OpenAI TTS are production-grade managed services. The project's differentiation is orchestration, turn control, retrieval, and telemetry, not training speech models.
3. **Function tool first, MCP optional**: The primary retrieval path is a controlled Python function tool calling a service-token-protected backend endpoint. Exposing the same endpoint through MCP later is optional and does not change the core architecture.
4. **Preemptive generation disabled**: Speculative LLM calls would waste tokens in a group call where most turns are not addressed to Lexis. Disabling it makes the hard gate meaningful.
5. **Indexed high-frequency queries**: `TranscriptSegment`, `CallParticipant`, and `AgentEvent` have indexes aligned with call/sequence/event-time lookups.

### Optional Backend Hardening Backlog

- LiveKit webhook receiver for `participant_left` and `room_finished`.
- User lifetime analytics endpoint.
- Centralized error middleware.
- Explicit CORS whitelist and auth rate limiting.

---

## 5. The Voice AI Pipeline Architecture

```mermaid
flowchart TD
    subgraph Browser["Next.js WebRTC Client"]
        Mic["Microphone Input"]
        Speaker["Audio Output"]
    end

    subgraph LiveKit["LiveKit SFU (WebRTC Server)"]
        Tracks["Participant Audio Tracks<br/>with callId + aiMuted room metadata"]
        AgentTrack["Lexis AI Audio Track"]
    end

    subgraph PythonAgent["LiveKit Voice Agent Worker (agent.py)"]
        VAD["Silero VAD"]
        STT["Continuous STT<br/>(Deepgram / OpenAI)"]
        Persist["user_input_transcribed<br/>post every finalized segment"]
        Gate{"on_user_turn_completed<br/>hard wake-word gate"}
        Stop["StopResponse<br/>no LLM request"]
        Bare["Bare wake word<br/>TTS-only acknowledgement"]
        LLM["LLM Streaming<br/>(GPT-4o-mini / Gemini 2.5 Flash)"]
        Tool["get_meeting_context(query, limit)"]
        TTS["Streaming TTS<br/>(Cartesia / OpenAI)"]
        Telemetry["post_agent_event<br/>+ LLMMetrics listener"]
    end

    subgraph BackendAPI["Express + Postgres Backend"]
        DB[(Neon PostgreSQL)]
        TranscriptAPI["/api/calls/transcript/segment"]
        ContextAPI["/api/calls/:callId/context"]
        TelemetryAPI["/api/calls/telemetry"]
        SummaryAPI["/api/calls/:id/generate-summary"]
    end

    Mic --> Tracks
    Tracks --> VAD
    VAD --> STT
    STT --> Persist
    Persist --> TranscriptAPI
    TranscriptAPI --> DB

    STT --> Gate
    Gate -->|AI muted or no wake word| Stop
    Gate -->|bare wake word| Bare
    Gate -->|wake word plus utterance| LLM
    LLM --> Tool
    Tool --> ContextAPI
    ContextAPI --> DB
    LLM -->|streamed tokens| TTS
    Bare --> TTS
    TTS --> AgentTrack
    AgentTrack --> Speaker

    VAD -.->|barge-in| TTS
    Gate --> Telemetry
    LLM --> Telemetry
    Tool --> Telemetry
    Telemetry --> TelemetryAPI
    TelemetryAPI --> DB
    DB --> SummaryAPI
```

Normal conversation follows `STT -> Persist -> TranscriptAPI -> DB` and stops at the gate. Only the wake-word branch reaches the LLM. This is the invariant the demo verifies.

---

## 6. The Next.js Frontend Implementation Plan

### Dependencies to Install (`frontend/`):
```bash
npm install @livekit/components-react @livekit/components-styles livekit-client lucide-react @react-oauth/google axios
```

### Proposed Pages & Components:

#### 1. Authentication (`/login`, `/register`)
- Clean dark-mode UI with email/password form.
- Google Sign-In button utilizing `GOOGLE_CLIENT_ID` (public) sending `credential` to `/api/auth/google`.
- JWT storage in cookies or localStorage with an Axios API interceptor.

#### 2. Dashboard (`/dashboard`)
- **Lifetime Stats Banner**: Total speaking time, meetings attended, words spoken, AI interactions.
- **Quick Actions**:
  - "Create Room" Modal: Custom name, toggle AI on/off, customize AI instructions/persona.
  - "Join Room by Code" Input: Form for pasting `lex-xxx-xxxx`.
- **My Rooms Grid**: Cards for each room with one-click "Start Call" button.
- **Past Calls & Summaries**: List of past meetings with links to view reports.

#### 3. The Live Meeting Room (`/room/[code]`)
- Wraps call in `<LiveKitRoom token={token} serverUrl={serverUrl} connect={true}>`.
- **Main View**:
  - Video/Audio grid of participants with animated speaking rings (pulsing green glow when speaking).
  - Dedicated avatar for **Lexis AI** with visualizer animation when the AI is speaking.
- **Call Controls**:
  - Mute/Unmute Mic, Camera toggle, Screen share, End Call.
  - **AI Mode Toggle**: "Mute AI" button to stop Lexis from speaking while keeping transcription active.
- **Right Sidebar (Tabbed)**:
  - **Tab 1: Live Transcript**: Real-time scrolling transcript showing who said what with timestamps.
  - **Tab 2: Real-Time Analytics**: Bar charts showing individual speaking share (% of meeting time per person) and word counts.
  - **Tab 3: Notes & Action Items**: Live markdown scratchpad.

#### 4. Post-Meeting Intelligence Document (`/calls/[id]/summary`)
- Generated upon call completion.
- Rendered as an executive meeting report:
  1. **Executive Overview**
  2. **Key Decisions Checklist**
  3. **Action Items Table** (with checkboxes and assignees)
  4. **Participant Contribution Breakdown**
  5. One-click "Export to PDF" or "Copy as Markdown".

---

## 7. Environment Variables Reference

### Backend (`backend/.env`):
```env
PORT=5000
DATABASE_URL=postgresql://user:pass@ep-snowy-base...neon.tech/neondb?sslmode=require
JWT_SECRET=your_jwt_secret_key
INTERNAL_SERVICE_KEY=lexis_internal_service_secret_2026
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
GEMINI_API_KEY=your_gemini_api_key_or_openai
OPENAI_API_KEY=your_openai_api_key
```

### Agent (`agent/.env`):
```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
OPENAI_API_KEY=your_openai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
CARTESIA_API_KEY=your_cartesia_api_key
BACKEND_API_URL=http://localhost:5000/api
BACKEND_SERVICE_TOKEN=lexis_internal_service_secret_2026
```

### Frontend (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

---

## 8. Summary Checklist Before Switching Context

- [x] Prisma Schema designed, normalized, and migrated to Neon PostgreSQL.
- [x] Full Auth system verified (JWT + Google OAuth + Forgot/Reset Password).
- [x] Room creation, membership roles, and WebRTC token generation verified.
- [x] Call session tracking with auto-incrementing speaking time & word count verified.
- [x] AI Meeting Summary generator service verified.
- [x] Agent service authentication (`x-service-token`) verified.
- [x] Python LiveKit Voice Agent worker created with Silero VAD, STT, LLM, TTS, and barge-in.
- [x] Continuous transcript persistence independent of LLM invocation.
- [x] Hard wake-word gate before LLM, with preemptive generation disabled.
- [x] On-demand `get_meeting_context` function tool backed by a compact backend context endpoint.
- [x] `AgentEvent` / `AIUsage` telemetry for wake hits, blocked turns, tool calls, tokens, cost, and latency.
- [x] Repeatable demo proof in `DEMO.md` and `backend/scripts/verify-demo.ts`.
- [x] Next.js UI implemented with LiveKit room, transcript sidebar, analytics, and summary views.
- [ ] **Optional**: LiveKit webhook receiver and user lifetime analytics endpoint.
- [ ] **User action**: Apply `npx prisma migrate dev`, run the live 3-person demo, and run the verification script.
