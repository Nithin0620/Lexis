# Lexis: Sequential Step-by-Step Next Steps Roadmap

This document outlines the exact, sequential order of tasks to complete the Lexis platform. 

Follow these steps one by one:

---

## 🎯 Phase 1: Complete Remaining Backend (Do This First)

### Step 1: Build the LiveKit Webhook Receiver
- **File to create**: `backend/controller/webhook.controller.ts` & `backend/routes/webhook.routes.ts`
- **Endpoint**: `POST /api/livekit/webhook`
- **What to do**:
  1. Use `WebhookReceiver` from `livekit-server-sdk` to verify incoming webhook signatures using `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
  2. Handle `participant_left`: Find active `CallParticipant` with matching `userId` and set `leftAt = new Date()`.
  3. Handle `room_finished`: Update `Call.status = "completed"` and `Call.endedAt = new Date()`.
  4. Ensure Express uses raw body parser for this specific route so cryptographic signature verification succeeds.

---

### Step 2: Build the User Analytics Endpoint
- **File to create**: `backend/controller/user.controller.ts` & `backend/routes/user.routes.ts`
- **Endpoint**: `GET /api/users/analytics` (Protected)
- **What to do**:
  1. Calculate lifetime statistics for `req.user.id`:
     - Total meetings attended: `prisma.callParticipant.count(...)`
     - Total speaking time (seconds & minutes): `_sum.speakingSeconds`
     - Total words spoken: `_sum.wordsSpoken`
     - Total AI interactions asked: `_sum.aiInteractions`
     - Total AI token cost: `_sum.estimatedCost` from `AIUsage`
  2. Fetch last 5 meetings with their dates, duration, and summary overviews.
  3. Return clean JSON for the frontend dashboard banner.

---

### Step 3: Backend Production Hardening
- **What to do**:
  1. **Global Error Middleware**: Add `backend/middlewares/error.middleware.ts` to catch unhandled errors and format clean JSON responses.
  2. **Database Performance Indexes**: Add `@@index([callId, userId])` in `CallParticipant` and `@@index([transcriptId, sequence])` in `TranscriptSegment` in `backend/prisma/schema.prisma`.
  3. **CORS Configuration**: Restrict CORS to `process.env.FRONTEND_URL || "http://localhost:3000"`.
  4. **Rate Limiting**: Add `express-rate-limit` on `/api/auth/login` and `/api/auth/register` to protect against brute force.

---

## 🔑 Phase 2: Credentials & Agent Setup

### Step 4: Obtain Your Free API Keys (Refer to `free.md`)
- [ ] **LiveKit Cloud**: Sign up at [cloud.livekit.io](https://cloud.livekit.io) (1,000 free mins/month) $\rightarrow$ Get `URL`, `API_KEY`, `API_SECRET`.
- [ ] **Deepgram**: Sign up at [deepgram.com](https://deepgram.com) $\rightarrow$ Get **$200 free credits** for fast STT.
- [ ] **Google Gemini**: Get free key at [aistudio.google.com](https://aistudio.google.com) (100% free tier for LLM).
- [ ] **Cartesia** or **OpenAI**: Get starter key for TTS.

### Step 5: Test the Voice Agent Locally
- Fill in `agent/.env` with your keys.
- Start the Express server: `cd backend && npm run dev`.
- Start the Voice Agent worker: `cd agent && source venv/bin/activate && python agent.py dev`.

---

## 💻 Phase 3: Next.js Frontend Implementation

### Step 6: Install Frontend Dependencies
Run in `frontend/`:
```bash
npm install @livekit/components-react @livekit/components-styles livekit-client lucide-react @react-oauth/google axios
```

### Step 7: Build Authentication Pages
- **Route**: `frontend/app/login/page.tsx` & `frontend/app/register/page.tsx`
- Build dark-mode login form with email & password.
- Embed Google Sign-In button (`<GoogleLogin />`) sending `credential` to `/api/auth/google`.
- Store JWT token and user profile in cookies / localStorage.

### Step 8: Build the Dashboard
- **Route**: `frontend/app/dashboard/page.tsx`
- **Lifetime Analytics Banner**: Display the stats from `GET /api/users/analytics` (Total meetings, Speaking time, Words spoken).
- **"Create Room" Modal**: Enter room name, custom AI prompt, and toggle AI on/off.
- **"Join Room" Input**: Quick input box for pasting room codes like `lex-449-c8dc`.
- **My Rooms List**: Cards displaying user's rooms with a "Start Call" button.

### Step 9: Build the Live Meeting Room
- **Route**: `frontend/app/room/[code]/page.tsx`
- Request WebRTC token from `POST /api/rooms/token`.
- Wrap the page in `<LiveKitRoom token={token} serverUrl={serverUrl} connect={true}>`.
- **Center Stage**:
  - Grid of participant video/audio avatars with green glowing pulse animations when speaking.
  - Dedicated avatar for **Lexis AI** with audio frequency visualizer wave when AI speaks.
- **Call Controls Bar**:
  - Mic toggle, Camera toggle, Screen share, "Leave Call" button.
  - "Mute AI" button (lets humans talk without AI responding).
- **Right Sidebar**:
  - **Live Transcript Tab**: Displays auto-scrolling chat bubbles tagged with participant names and timestamps.
  - **Live Speaking Stats Tab**: Real-time progress bars showing % speaking time per person.

### Step 10: Build the Post-Meeting Intelligence Report Page
- **Route**: `frontend/app/calls/[id]/summary/page.tsx`
- Displays the generated document from `GET /api/calls/:id`:
  1. Executive Summary Overview
  2. Key Decisions Checklist
  3. Action Items Table with assignees and checkboxes
  4. Per-Participant Contribution Breakdown
  5. "Download PDF" / "Copy Markdown" buttons.

---

## 🚀 Phase 4: Full End-to-End Test

### Step 11: Real Multi-User Test
1. Open two browser windows (or phone + laptop) and join the same room code.
2. Speak to each other and observe:
   - LiveKit WebRTC individual audio.
   - Live real-time transcript appearing on the screen.
   - Silero VAD detecting pauses.
   - Lexis AI responding when addressed.
   - Interruption: Talking while Lexis speaks immediately cuts off the AI.
3. End the call and inspect:
   - Generated meeting summary with decisions and action items.
   - Updated speaking time and word count for each participant.
