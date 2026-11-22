# Lexis: Free Tiers & Free Credits Guide

This guide details how to develop and test the **Lexis** Voice AI Group Meeting platform **100% free** using official provider free tiers and starter credits.

---

## 1. LiveKit (WebRTC Audio Server)

### Option A: LiveKit Cloud (Recommended for Dev)
- **Free Allowance**: **1,000 participant minutes/month** and **50 GB bandwidth**.
- **Setup**:
  1. Sign up for a free account at [cloud.livekit.io](https://cloud.livekit.io).
  2. Create a project and grab your `WebSocket URL`, `API Key`, and `API Secret`.
  3. Paste into `backend/.env` and `agent/.env`.

### Option B: 100% Free Self-Hosted (Unlimited)
- LiveKit Server is open-source. You can run it locally with zero limits via Docker:
  ```bash
  docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev
  ```
  - `LIVEKIT_URL=ws://127.0.0.1:7880`
  - `LIVEKIT_API_KEY=devkey`
  - `LIVEKIT_API_SECRET=secret`

---

## 2. Speech-to-Text (STT)

### Deepgram Nova-2 (Recommended)
- **Free Allowance**: **$200 in free starter credits** upon signup at [deepgram.com](https://deepgram.com/).
- **Capacity**: At Deepgram's pay-as-you-go rate (~$0.0043/minute), $200 yields **~750+ hours of audio transcription**.
- **Latency**: ~150–250ms streaming latency.
- **Key**: Put your key in `agent/.env` as `DEEPGRAM_API_KEY`.

### Groq Whisper (Free Alternative)
- Free API access to `whisper-large-v3` via [console.groq.com](https://console.groq.com/).

---

## 3. Large Language Model (LLM)

### Google Gemini (Recommended Free)
- **Free Allowance**: Google AI Studio provides a **100% free tier** for `gemini-1.5-flash` and `gemini-2.0-flash`.
- **Limits**: Up to **15 Requests Per Minute (RPM)** and **1,500 requests per day** completely free without a credit card.
- **Key**: Generate a free key at [aistudio.google.com](https://aistudio.google.com/) and place in `agent/.env` as `GOOGLE_API_KEY`.

### Groq Llama 3.3 70B (Free Alternative)
- Ultra-low latency (~500 tokens/sec) on Groq's free tier.

### OpenAI GPT-4o-mini
- If you have an existing OpenAI account with credits, `gpt-4o-mini` is extremely cheap ($0.15 per 1,000,000 tokens).

---

## 4. Text-to-Speech (TTS)

### Cartesia Sonic (Recommended for Voice)
- **Free Allowance**: Free starter credits on [cartesia.ai](https://cartesia.ai/).
- **Latency**: ~100–150ms voice generation (feels like natural human interruption response).
- **Key**: Put in `agent/.env` as `CARTESIA_API_KEY`.

### Google Cloud Text-to-Speech (Free Alternative)
- **Free Allowance**: **4,000,000 free characters every month** forever on Google Cloud Free Tier.

### ElevenLabs
- Free tier includes 10,000 characters per month.

---

## 5. PostgreSQL Database

### Neon Serverless Postgres
- **Free Allowance**: **0.5 GB storage** and **shared compute** forever free at [neon.tech](https://neon.tech/).
- Already integrated and migrated in your `backend/.env`!

---

## Summary of the Recommended Free Stack:

| Role | Provider | Cost | Free Capacity |
| :--- | :--- | :--- | :--- |
| **WebRTC Audio** | LiveKit Cloud | $0 | 1,000 mins/month |
| **STT** | Deepgram | $0 | $200 free credits (~750 hours) |
| **LLM** | Gemini 2.0 / Groq | $0 | 1,500 requests/day free |
| **TTS** | Cartesia / OpenAI | $0 | Starter credits |
| **Database** | Neon Postgres | $0 | 0.5 GB free forever |
