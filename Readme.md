# 🎙️ Lexis — AI-Powered Real-Time Group Meeting Platform

> **An intelligent group calling platform with zero-diarization speaker attribution, real-time voice AI participation, live meeting analytics, and automated post-meeting intelligence documentation.**

---

[![Node.js Version](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![Python Version](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20(React%2019)-black.svg)](https://nextjs.org/)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC-orange.svg)](https://livekit.io/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20(Neon)-blue.svg)](https://neon.tech/)
[![Prisma ORM](https://img.shields.io/badge/ORM-Prisma%206-indigo.svg)](https://www.prisma.io/)

---

## 📖 Essential Documentation

| Document | Description |
| :--- | :--- |
| 📋 **[plan.md](./plan.md)** | Implemented work plan and resume-ready engineering bullets. |
| 🧪 **[DEMO.md](./DEMO.md)** | Repeatable 3-person demo, log evidence, and database proof checklist. |
| 📘 **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Architectural blueprint, target voice pipeline, and technical decisions. |
| 📋 **[NEXT_STEPS.md](./NEXT_STEPS.md)** | Original sequential checklist of remaining tasks. |
| 💡 **[free.md](./free.md)** | Guide to running this platform **100% free** using official provider credits. |

---

## ✨ Key Features

- **⚡ Zero-Diarization Individual Speaker Attribution**: By leveraging LiveKit WebRTC's individual participant audio tracks, Lexis identifies speakers directly from their connection tokens with 100% precision—no complex or buggy ML diarization models needed.
- **🤖 Gated Voice AI Participant**: Lexis AI joins as a real peer. STT stays on for every utterance, but the LLM only runs after a whole-word wake phrase. Normal conversation produces transcript rows and zero LLM calls.
- **🎯 On-Demand Meeting Retrieval**: When asked about earlier discussion, the agent calls `get_meeting_context(query, limit)`, which fetches compact, query-ranked lines from the persisted transcript instead of stuffing the full meeting into every prompt.
- **🛑 Real-Time Barge-in & Interruption**: If a human interrupts the AI while it's speaking, Silero VAD immediately cuts off the AI audio track and returns the floor to the human.
- **📊 Real-Time Per-Participant Analytics**: Tracks individual speaking duration (seconds), word counts, AI interactions, token usage, estimated cost, and latency.
- **🔍 Demo-Proof Telemetry**: `AgentEvent` and `AIUsage` rows prove that passive talk was blocked by the gate, one wake-word turn reached the LLM, the context tool was used, and usage was recorded.
- **📝 Automated Meeting Intelligence**: When a call wraps up, an LLM analyzes the full transcript to generate:
  - Executive Overview
  - Key Decisions Made
  - Action Items Table (with assignees & deadlines)
  - Individual Contribution Summaries

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Next.js 16 WebRTC Frontend"]
        Mic["Microphone"]
        Spk["Speakers"]
    end

    subgraph SFU["LiveKit WebRTC Server"]
        Tracks["Participant Audio Tracks<br/>callId + aiMuted metadata"]
        AITrack["Lexis AI Audio Stream"]
    end

    subgraph Agent["Python 3.12 Voice Agent Worker"]
        VAD["Silero VAD"]
        STT["Continuous STT<br/>Deepgram / OpenAI"]
        Persist["Post every finalized segment"]
        Gate{"Hard wake-word gate<br/>StopResponse if not addressed"}
        LLM["LLM Streaming<br/>Gemini 2.5 Flash / GPT-4o-mini"]
        Tool["get_meeting_context"]
        TTS["Streaming TTS<br/>Cartesia / OpenAI Alloy"]
        Telemetry["AgentEvent + LLMMetrics"]
    end

    subgraph API["Express 5 + TypeScript Backend"]
        REST["Transcript / Context / Telemetry APIs"]
        Prisma["Prisma ORM"]
        DB[(Neon Serverless PostgreSQL)]
        Summary["Meeting Summary Engine"]
    end

    Mic --> Tracks --> VAD --> STT
    STT --> Persist --> REST
    REST --> Prisma --> DB

    STT --> Gate
    Gate -->|no wake word| GateStop["No LLM request"]
    Gate -->|wake word| LLM
    LLM --> Tool --> REST
    LLM --> TTS --> AITrack --> Spk
    VAD -.->|barge-in| TTS
    Gate --> Telemetry
    LLM --> Telemetry
    Telemetry --> REST
    DB --> Summary --> DB
```

Passive conversation follows `STT -> Persist -> DB` and stops at `Gate`. Only an explicit wake-word turn reaches the LLM.

---

## 🛠️ Tech Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `@livekit/components-react`, `@react-oauth/google`, Lucide Icons |
| **Backend API** | Node.js, Express 5, TypeScript, Prisma ORM 6, JWT, bcryptjs, `google-auth-library` |
| **Database** | PostgreSQL (Neon Serverless Postgres) |
| **Real-Time Media** | LiveKit SFU (WebRTC Audio & Video) |
| **Voice AI Agent** | Python 3.12, `livekit-agents` v1.8+, Silero VAD, `aiohttp` |
| **AI Providers** | Google Gemini 2.5 Flash / GPT-4o-mini (LLM), Deepgram Nova-2 / OpenAI (STT), Cartesia Sonic / OpenAI Alloy (TTS) |

---

## 📂 Repository Structure

```text
Lexis/
├── backend/                  # Express + TypeScript REST API
│   ├── controller/           # auth, room, call controllers
│   ├── middlewares/          # auth & service token middleware
│   ├── routes/               # Express route declarations
│   ├── services/             # ai, livekit, and call services
│   ├── scripts/              # verify-demo.ts database evidence checker
│   ├── prisma/               # schema.prisma & PostgreSQL migrations
│   ├── server.ts             # Server entry point
│   └── package.json
│
├── agent/                    # Python LiveKit Voice AI Worker
│   ├── agent.py              # Main VAD + STT + LLM + TTS pipeline
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Agent configuration template
│   └── venv/                 # Virtual environment
│
├── frontend/                 # Next.js 16 Web Application
│   ├── app/                  # Next.js App Router (login, dashboard, room)
│   ├── package.json
│   └── tailwind.config.ts
│
├── free.md                   # Complete guide to 100% free credits
├── NEXT_STEPS.md             # Original action checklist
├── plan.md                   # Implemented work plan
├── DEMO.md                   # Repeatable live demo checklist
├── ARCHITECTURE.md           # Master blueprint & technical spec
└── Readme.md                 # This file
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20 or higher (`node -v`)
- **Python**: v3.12 or higher (`python3 --version`)
- **PostgreSQL**: Neon database URL (already configured in `backend/.env`)

---

### 2. Backend Setup
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```
*API will run at `http://localhost:5000` (Health check at `http://localhost:5000/health`).*

---

### 3. Voice AI Agent Setup
```bash
cd agent
source venv/bin/activate
pip install -r requirements.txt
python agent.py download-files    # Pre-downloads Silero VAD weights
python agent.py dev               # Runs the worker in development mode
```

---

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*App will run at `http://localhost:3000`.*

---

### 5. Verify a Demo Call
Follow [DEMO.md](./DEMO.md) for the live script. After a call ends, check the database evidence with:

```bash
cd backend
npx tsx scripts/verify-demo.ts --call-id <call-id> --passive-end <epoch-ms>
```

---

## 📡 API Reference Overview

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user with email & password |
| `POST` | `/api/auth/login` | Login with credentials |
| `POST` | `/api/auth/google` | Sign in or sign up with Google ID Token |
| `POST` | `/api/auth/forgot-password`| Request 15-minute password reset token |
| `POST` | `/api/auth/reset-password` | Set new password using reset token |
| `GET`  | `/api/auth/me` | Fetch authenticated user profile |

### 🏠 Rooms (`/api/rooms`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/rooms` | Create a room (returns code e.g. `lex-449-c8dc`) |
| `POST` | `/api/rooms/join` | Join room via 8-character code |
| `GET`  | `/api/rooms/my` | Get all rooms created or joined by user |
| `GET`  | `/api/rooms/:identifier`| Get room details and active call |
| `POST` | `/api/rooms/token` | Generate LiveKit WebRTC Access Token |

### 📞 Calls & Meeting Intelligence (`/api/calls`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/calls/start` | Start or retrieve active call in room |
| `PUT`  | `/api/calls/:id/end` | End call and calculate duration |
| `POST` | `/api/calls/transcript/segment` | Save every finalized speech chunk, auto-update speaking time & words |
| `GET`  | `/api/calls/:callId/transcript` | Get full transcript with segments |
| `GET`  | `/api/calls/:callId/context` | Service-token-protected compact transcript context for the agent |
| `POST` | `/api/calls/telemetry` | Service-token-protected agent events, token usage, and cost telemetry |
| `GET`  | `/api/calls/:id` | Call details including participants, usage, and agent events |
| `POST` | `/api/calls/:id/generate-summary` | **Trigger AI to generate meeting report** |

---

## 📜 License
ISC © 2026 Lexis Team.
