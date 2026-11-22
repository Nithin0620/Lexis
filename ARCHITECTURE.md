# Lexis: End-to-End System Architecture & Roadmap

This document serves as the master engineering blueprint for **Lexis**, an AI-powered real-time group meeting platform. It details everything built so far, the remaining backend tasks (major and minor), the Voice AI streaming pipeline, and the frontend implementation roadmap.

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
  - `POST /token`: Signs LiveKit WebRTC `AccessToken` with `canPublish` and `canSubscribe`.
- **Calls & Transcripts (`/api/calls`)**:
  - `POST /start`: Initiates or returns active room call.
  - `POST /join` & `POST /leave`: Participant tracking.
  - `PUT /:id/end`: Completes call, updates timestamps.
  - `GET /:id`: Full call inspection (participants, stats, transcripts, summary).
  - `POST /transcript/segment`: Ingests speech segments; automatically calculates duration and increments participant's `speakingSeconds` and `wordsSpoken`.
  - `GET /:callId/transcript`: Full ordered transcript.
  - `POST /summary`: Manual summary save.
  - `POST /:id/generate-summary`: **AI Meeting Intelligence Generator** powered by Gemini 2.0 Flash / OpenAI.
- **Security & Internal Auth**:
  - `x-service-token` authentication in `auth.middleware.ts` allowing the Python agent worker to communicate with Express securely.

### C. LiveKit Voice Agent Worker (`agent/agent.py`)
- Built using **Python 3.12** and official **`livekit-agents` v1.8+**.
- **Silero VAD**: Real-time voice activity detection with 500ms endpointing.
- **STT**: Deepgram Nova-2 / OpenAI.
- **LLM**: GPT-4o-mini / Gemini with room-specific prompts.
- **TTS**: Cartesia Sonic / OpenAI Alloy.
- **Barge-in / Interruption**: Cuts off AI speech immediately if a human starts talking.
- **Backend Sync**: Automatically fires async HTTP POSTs with `x-service-token` to `/api/calls/transcript/segment` whenever anyone (human or AI) finishes a sentence.

---

## 3. The 2 Immediate Remaining Backend Items

### Item 2: LiveKit Webhook Receiver (`POST /api/livekit/webhook`)
* **Problem it solves**: If a user closes their browser tab, loses WiFi, or shuts their laptop, the frontend cannot send a `POST /leave` request.
* **Implementation Plan**:
  1. Create `backend/controller/webhook.controller.ts`.
  2. Use `WebhookReceiver` from `livekit-server-sdk`:
     ```typescript
     import { WebhookReceiver } from "livekit-server-sdk";
     const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
     ```
  3. LiveKit sends events:
     - `participant_left`: Match `event.participant.identity` (which is `userId`) and update `CallParticipant.leftAt = new Date()`.
     - `room_finished`: When the LiveKit room closes, update `Call.status = "completed"` and `Call.endedAt = new Date()`.
  4. Mount route at `POST /api/livekit/webhook` (must use raw body for signature verification).

---

### Item 4: User Analytics & Lifetime Dashboard (`GET /api/users/analytics`)
* **Problem it solves**: Powers the user's personal meeting dashboard with high-level intelligence and lifetime ROI metrics.
* **Implementation Plan**:
  1. Create `backend/controller/user.controller.ts` and `backend/routes/user.routes.ts`.
  2. Query Prisma aggregates for `req.user.id`:
     - Total meetings attended: `prisma.callParticipant.count({ where: { userId } })`.
     - Total speaking time: `prisma.callParticipant.aggregate({ where: { userId }, _sum: { speakingSeconds: true } })`.
     - Total words spoken: `_sum: { wordsSpoken: true }`.
     - Total AI interactions: `_sum: { aiInteractions: true }`.
     - Total AI token costs: `prisma.aIUsage.aggregate({ where: { userId }, _sum: { estimatedCost: true } })`.
     - Recent meetings list: Last 5 calls with their summary overviews.

---

## 4. Remaining Backend Details (Edge Cases, Production Hardening)

Even if seemingly minor, these items make the backend 100% production-grade:

1. **Centralized Error Handling Middleware (`backend/middlewares/error.middleware.ts`)**:
   - Catches unhandled promise rejections and Prisma errors (e.g., `P2002` unique constraint violation) and converts them into user-friendly JSON responses instead of crashing or returning 500.
2. **Room Metadata Sync on Call Start**:
   - In `backend/controller/call.controller.ts`, when a call starts, use `RoomServiceClient` from `livekit-server-sdk` to update LiveKit room metadata with `{ callId: call.id, aiPrompt: room.aiPrompt }`. This guarantees the Python agent receives the `callId` dynamically upon connection.
3. **Database Performance Indexing (`backend/prisma/schema.prisma`)**:
   - Add explicit indexes for high-frequency queries:
     ```prisma
     model TranscriptSegment {
       // ...
       @@index([transcriptId, sequence])
     }
     model CallParticipant {
       // ...
       @@index([callId, userId])
     }
     ```
4. **CORS Whitelist Configuration**:
   - Update `app.use(cors())` in `server.ts` to explicitly allow `process.env.FRONTEND_URL || "http://localhost:3000"`.
5. **Rate Limiting**:
   - Add `express-rate-limit` on `/api/auth/login` and `/api/auth/register` (e.g., max 10 requests per minute per IP) to prevent credential stuffing.

---

## 5. The Voice AI Pipeline Architecture

```mermaid
flowchart TD
    subgraph Browser["Next.js WebRTC Client"]
        Mic["Microphone Input"]
        Speaker["Audio Output"]
    end

    subgraph LiveKit["LiveKit SFU (WebRTC Server)"]
        TrackA["Participant A Audio Track"]
        TrackB["Participant B Audio Track"]
        AgentTrack["Lexis AI Audio Track"]
    end

    subgraph PythonAgent["LiveKit Voice Agent Worker (agent.py)"]
        VAD["Silero VAD\n(Voice Activity Detection)"]
        STT["Speech-to-Text\n(Deepgram / OpenAI)"]
        Filter{"Group Call\nTrigger Check"}
        LLM["LLM Streaming\n(GPT-4o-mini / Gemini)"]
        TTS["Streaming TTS\n(Cartesia / OpenAI)"]
    end

    subgraph BackendAPI["Express + Postgres Backend"]
        DB[(Neon PostgreSQL)]
        StatsAPI["/api/calls/transcript/segment\n(Updates speaking time & words)"]
        SummaryAPI["/api/calls/:id/generate-summary\n(LLM Meeting Intelligence)"]
    end

    Mic --> TrackA
    TrackA --> VAD
    TrackB --> VAD
    VAD -->|Speech Boundary Detected| STT
    STT -->|Finalized Sentence| StatsAPI
    StatsAPI --> DB

    STT --> Filter
    Filter -->|AI Addressed / Conversational| LLM
    LLM -->|Streamed Tokens| TTS
    TTS -->|Audio Packets| AgentTrack
    AgentTrack --> Speaker

    VAD -.->|Interruption / Barge-in| TTS
    DB --> SummaryAPI
```

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
- [ ] **Next**: Item 2 (LiveKit Webhook) & Item 4 (User Analytics Endpoint).
- [ ] **Next**: Frontend implementation (Next.js UI).
