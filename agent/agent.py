import os
import sys
import json
import logging
import asyncio
import aiohttp
from dotenv import load_dotenv

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.voice.events import UserInputTranscribedEvent, ConversationItemAddedEvent
from livekit.plugins import silero, openai, deepgram, cartesia, google

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lexis-voice-agent")

BACKEND_API_URL   = os.getenv("BACKEND_API_URL",   "http://localhost:5000/api")
BACKEND_SERVICE_TOKEN = os.getenv("BACKEND_SERVICE_TOKEN", "lexis_internal_service_secret_2026")

# ── Wake words ────────────────────────────────────────────────────────────────
# Lexis responds ONLY when the transcript contains one of these trigger phrases.
# Add any phrase you want — all lowercase, Deepgram handles the matching.
WAKE_WORDS = [
    "hey lexis",
    "ok lexis",
    "lexis",
    "hey lewis",   # common mis-hear
    "lewis",       # common mis-hear
    "l axis",      # Deepgram mis-transcription of "lexis"
    "laxis",       # another variant
    "ai",          # short trigger
    "hey ai",
]

# How many seconds Lexis stays "active" after the last wake word before
# going back to passive listening mode.
ACTIVE_WINDOW_SECONDS = 30

# ── Default system prompt ─────────────────────────────────────────────────────
DEFAULT_SYSTEM_PROMPT = """
You are Lexis, an intelligent AI voice assistant in a live group meeting.

Personality:
- Concise and direct — never give long monologues in a live call
- Warm, professional, and helpful
- Never interrupt unless spoken to

Behavior rules:
- You are activated when someone says your name ("Lexis", "Hey Lexis", etc.)
- Keep answers under 3 sentences unless a detailed explanation is specifically requested
- If asked to summarize the meeting so far, do so in bullet points
- If asked to note an action item, confirm it verbally
- Use natural spoken language, not markdown or lists in your spoken responses
"""

# ─────────────────────────────────────────────────────────────────────────────

def contains_wake_word(text: str) -> bool:
    """Return True if the transcript contains any configured wake word."""
    lowered = text.lower().strip()
    return any(w in lowered for w in WAKE_WORDS)


def strip_wake_word(text: str) -> str:
    """Remove the wake word from the front of the transcript so the LLM
    only sees the actual question/request."""
    lowered = text.lower().strip()
    for w in sorted(WAKE_WORDS, key=len, reverse=True):  # longest first
        if lowered.startswith(w):
            stripped = text[len(w):].strip(" ,;:-")
            return stripped if stripped else text
    return text


async def post_transcript_segment(
    call_id: str,
    speaker_id: str,
    speaker_name: str,
    text: str,
    is_ai: bool = False,
):
    """Push a finalized transcript segment to the Express backend."""
    if not call_id or not text.strip():
        return

    url = f"{BACKEND_API_URL}/calls/transcript/segment"
    payload = {
        "callId":      call_id,
        "speakerId":   speaker_id,
        "speakerName": speaker_name,
        "content":     text.strip(),
        "isAi":        is_ai,
        "startTime":   0,
        "endTime":     0,
    }

    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Content-Type": "application/json",
                "x-service-token": BACKEND_SERVICE_TOKEN,
            }
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status in (200, 201):
                    logger.info(f"Saved segment [{speaker_name}]: '{text[:40]}…'")
                else:
                    logger.warning(f"Backend returned {resp.status} saving segment")
    except Exception as e:
        logger.error(f"Failed to post transcript segment: {e}")


# ─────────────────────────────────────────────────────────────────────────────
async def entrypoint(ctx: JobContext):
    logger.info(f"Connecting to room: {ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # ── Room metadata ──────────────────────────────────────────────────────
    room_metadata = {}
    if ctx.room.metadata:
        try:
            room_metadata = json.loads(ctx.room.metadata)
        except Exception:
            pass

    call_id      = room_metadata.get("callId", "")
    custom_prompt = room_metadata.get("aiPrompt") or DEFAULT_SYSTEM_PROMPT

    # ai_muted flag — the frontend can toggle this via a room data message
    ai_muted = False

    # Wake-word state: timestamp of last wake word hit
    last_wake_time: float = 0.0

    def is_active() -> bool:
        """True if we're within the active window after a wake word."""
        import time
        return (time.time() - last_wake_time) < ACTIVE_WINDOW_SECONDS

    # ── AI components ──────────────────────────────────────────────────────
    vad = silero.VAD.load()

    if os.getenv("DEEPGRAM_API_KEY"):
        stt = deepgram.STT()
        logger.info("STT: Deepgram")
    else:
        stt = openai.STT()
        logger.info("STT: OpenAI Whisper")

    # 3. Large Language Model — use Gemini if key present, else OpenAI
    if os.getenv("GOOGLE_API_KEY"):
        from google.genai import types as genai_types
        llm_instance = google.LLM(
            model="gemini-2.5-flash",
            http_options=genai_types.HttpOptions(api_version="v1beta"),
        )
        logger.info("LLM: Google Gemini 2.5 Flash (v1beta)")
    else:
        llm_instance = openai.LLM(model="gpt-4o-mini")
        logger.info("LLM: OpenAI GPT-4o-mini")

    if os.getenv("CARTESIA_API_KEY"):
        tts = cartesia.TTS()
        logger.info("TTS: Cartesia")
    else:
        tts = openai.TTS(voice="alloy")
        logger.info("TTS: OpenAI")

    agent = Agent(
        instructions=custom_prompt,
        vad=vad,
        stt=stt,
        llm=llm_instance,
        tts=tts,
        allow_interruptions=True,
    )

    session = AgentSession(
        vad=vad,
        stt=stt,
        llm=llm_instance,
        tts=tts,
        allow_interruptions=True,
    )

    # ── Handle "mute ai" / "unmute ai" data messages from frontend ─────────
    @ctx.room.on("data_received")
    def on_data(data_packet):
        nonlocal ai_muted
        try:
            msg = json.loads(bytes(data_packet.data).decode())
            if msg.get("type") == "mute_ai":
                ai_muted = msg.get("muted", False)
                logger.info(f"AI mute state → {ai_muted}")
        except Exception:
            pass

    # ── Transcript handler: wake-word gate + transcript push ───────────────
    @session.on("user_input_transcribed")
    def on_user_transcribed(event: UserInputTranscribedEvent):
        nonlocal last_wake_time

        if not event.is_final or not event.transcript.strip():
            return

        transcript = event.transcript.strip()

        # Resolve speaker name from room participants
        speaker_id   = getattr(event, "speaker_id", "") or ""
        speaker_name = "Participant"
        if speaker_id and speaker_id in ctx.room.remote_participants:
            p = ctx.room.remote_participants[speaker_id]
            speaker_name = p.name or p.identity

        # Always save to transcript regardless of wake word
        if call_id:
            asyncio.create_task(
                post_transcript_segment(
                    call_id=call_id,
                    speaker_id=speaker_id,
                    speaker_name=speaker_name,
                    text=transcript,
                    is_ai=False,
                )
            )

        logger.info(f"[{speaker_name}]: {transcript}")

        # ── Wake word check ────────────────────────────────────────────────
        if ai_muted:
            logger.info("AI is muted — skipping response")
            return

        import time

        if contains_wake_word(transcript):
            last_wake_time = time.time()
            logger.info(f"Wake word detected! Active window reset. [{transcript}]")

            # Strip the wake word so the LLM only sees the question
            clean_text = strip_wake_word(transcript)

            if clean_text:
                # Inject the clean question directly into the session
                asyncio.create_task(session.say_on_behalf(clean_text))
            else:
                # Wake word with no question — give a short acknowledgement
                asyncio.create_task(session.say("Yes? How can I help?"))

        elif is_active():
            # We're in the active window (follow-up turn) — let the agent respond
            logger.info("Follow-up turn within active window — responding")
            # The session handles follow-up automatically; nothing to do here

        else:
            # No wake word, outside active window — silent, do not respond
            logger.info("No wake word — passive listening")
            # interrupt() is not a coroutine — call it directly
            session.interrupt()

    # ── Log AI responses to transcript ────────────────────────────────────
    @session.on("conversation_item_added")
    def on_item_added(event: ConversationItemAddedEvent):
        item = event.item
        if not (hasattr(item, "role") and item.role == "assistant"):
            return

        text = ""
        if hasattr(item, "content"):
            if isinstance(item.content, str):
                text = item.content
            elif isinstance(item.content, list):
                text = " ".join(str(c) for c in item.content)

        if text and call_id:
            asyncio.create_task(
                post_transcript_segment(
                    call_id=call_id,
                    speaker_id="ai_agent",
                    speaker_name="Lexis AI",
                    text=text,
                    is_ai=True,
                )
            )

    # ── Start ──────────────────────────────────────────────────────────────
    await session.start(agent, room=ctx.room)

    logger.info("Lexis AI is ready — waiting for wake word")
    await session.say(
        "Hello everyone! I'm Lexis, your AI assistant. "
        "Say my name to get my attention — for example, 'Hey Lexis, what was just decided?'"
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(entrypoint_fnc=entrypoint)
    )
