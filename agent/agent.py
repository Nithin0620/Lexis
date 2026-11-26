import os
import re
import sys
import json
import time
import logging
import asyncio
import aiohttp
from dataclasses import dataclass
from dotenv import load_dotenv

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
    llm,
)
from livekit.agents.llm import ChatContext, ChatMessage, StopResponse
from livekit.agents.metrics import LLMMetrics
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.voice.events import UserInputTranscribedEvent, ConversationItemAddedEvent
from livekit.plugins import silero, openai, deepgram, cartesia, google

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lexis-voice-agent")

BACKEND_API_URL   = os.getenv("BACKEND_API_URL",   "http://localhost:5000/api")
BACKEND_SERVICE_TOKEN = os.getenv("BACKEND_SERVICE_TOKEN", "lexis_internal_service_secret_2026")
MODEL_NAME = "unknown"

# ── Wake words ────────────────────────────────────────────────────────────────
# Lexis responds ONLY when the transcript contains one of these explicit phrases.
# All entries must stay lowercase; matching is word-boundary based.
WAKE_WORDS = [
    "hey lexis",
    "ok lexis",
    "lexis",
    "hey lewis",   # common mis-hear
    "lewis",       # common mis-hear
    "l axis",      # Deepgram mis-transcription of "lexis"
    "laxis",       # another variant
]

WAKE_WORD_PATTERN = re.compile(
    r"(?<!\w)(?:"
    + "|".join(
        r"\s+".join(re.escape(part) for part in phrase.split())
        for phrase in sorted(WAKE_WORDS, key=len, reverse=True)
    )
    + r")(?!\w)",
    re.IGNORECASE,
)

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

CONTEXT_TOOL_PROMPT = """
Context retrieval:
- Use get_meeting_context only when the user asks about earlier discussion,
  decisions, action items, or something that was said earlier in the call.
- Do not call it for general conversation or questions you can answer from the
  current turn alone.
- Base historical answers only on the transcript lines returned by the tool.
"""

# ─────────────────────────────────────────────────────────────────────────────

def contains_wake_word(text: str) -> bool:
    """Return True only for whole-word wake phrase matches."""
    return WAKE_WORD_PATTERN.search(text) is not None


def strip_wake_word(text: str) -> str:
    """Remove the wake phrase so the LLM only sees the actual request."""
    match = WAKE_WORD_PATTERN.search(text)
    if not match:
        return text.strip()

    stripped = text[: match.start()] + " " + text[match.end() :]
    return stripped.strip(" ,;:-")


async def post_transcript_segment(
    call_id: str,
    speaker_id: str,
    speaker_name: str,
    text: str,
    is_ai: bool = False,
    sequence: int = 0,
    start_time: float = 0,
    end_time: float = 0,
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
        "startTime":   start_time,
        "endTime":     end_time,
        "sequence":    sequence,
    }

    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Content-Type": "application/json",
                "x-service-token": BACKEND_SERVICE_TOKEN,
            }
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status in (200, 201):
                    logger.info(f"Saved segment #{sequence} [{speaker_name}]: '{text[:40]}…'")
                else:
                    body = await resp.text()
                    logger.warning(
                        f"Backend returned {resp.status} saving segment: {body[:200]}"
                    )
    except Exception as e:
        logger.error(f"Failed to post transcript segment: {e}")


async def fetch_meeting_context(call_id: str, query: str, limit: int) -> list[dict]:
    """Fetch compact transcript context from the Express backend."""
    url = f"{BACKEND_API_URL}/calls/{call_id}/context"
    params = {"query": query, "limit": max(1, min(limit, 50))}

    async with aiohttp.ClientSession() as session:
        headers = {"x-service-token": BACKEND_SERVICE_TOKEN}
        async with session.get(url, params=params, headers=headers) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"Backend returned {resp.status}: {body[:200]}")
            data = await resp.json()

    return data.get("segments", [])


async def post_agent_event(
    call_id: str,
    event_type: str,
    speaker_id: str = "",
    model: str = "",
    input_tokens: int = 0,
    output_tokens: int = 0,
    latency_ms: float = 0,
    estimated_cost: float | None = None,
    metadata: dict | None = None,
) -> None:
    """Post a telemetry event to the Express backend."""
    if not call_id:
        return

    payload = {
        "callId": call_id,
        "eventType": event_type,
        "timestamp": int(time.time() * 1000),
        "speakerId": speaker_id or None,
        "model": model or None,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "latencyMs": latency_ms,
        "metadata": metadata or {},
    }
    if estimated_cost is not None:
        payload["estimatedCost"] = estimated_cost

    try:
        async with aiohttp.ClientSession() as session:
            headers = {"x-service-token": BACKEND_SERVICE_TOKEN}
            url = f"{BACKEND_API_URL}/calls/telemetry"
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status not in (200, 201):
                    body = await resp.text()
                    logger.warning(
                        f"Backend returned {resp.status} saving {event_type}: {body[:200]}"
                    )
    except Exception as e:
        logger.error(f"Failed to post agent event {event_type}: {e}")


@dataclass
class LexisUserData:
    call_id: str = ""
    ai_muted: bool = False
    trigger_speaker_id: str = ""


class LexisAgent(Agent):
    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        call_id = self.session.userdata.call_id
        speaker_id = self.session.userdata.trigger_speaker_id

        if self.session.userdata.ai_muted:
            logger.info("Hard gate: AI muted — blocked turn")
            asyncio.create_task(
                post_agent_event(call_id, "ai_muted_turn", speaker_id=speaker_id)
            )
            raise StopResponse()

        text = new_message.text_content or ""
        if not contains_wake_word(text):
            logger.info(f"Hard gate: blocked turn without wake word: {text[:80]!r}")
            asyncio.create_task(
                post_agent_event(call_id, "false_trigger_blocked", speaker_id=speaker_id)
            )
            raise StopResponse()

        asyncio.create_task(
            post_agent_event(call_id, "wake_word_hit", speaker_id=speaker_id, model=MODEL_NAME)
        )

        clean_text = strip_wake_word(text)
        if not clean_text:
            logger.info("Hard gate: bare wake word — TTS-only acknowledgement")
            raise StopResponse()

        new_message.content = [clean_text]
        asyncio.create_task(
            post_agent_event(call_id, "llm_call_started", speaker_id=speaker_id, model=MODEL_NAME)
        )
        logger.info(f"Hard gate: wake word accepted — {clean_text[:80]!r}")

    @function_tool()
    async def get_meeting_context(
        self,
        context: RunContext[LexisUserData],
        query: str,
        limit: int = 20,
    ) -> str:
        """Fetch relevant transcript context from the current meeting.

        Args:
            query: What the user wants to recall from earlier in the meeting.
            limit: Maximum number of transcript lines to return.
        """
        call_id = context.userdata.call_id
        if not call_id:
            return "No active call is available, so meeting context cannot be retrieved."

        logger.info(f"get_meeting_context(query={query!r}, limit={limit})")

        try:
            segments = await fetch_meeting_context(call_id, query, limit)
        except Exception as e:
            logger.error(f"Failed to fetch meeting context: {e}")
            asyncio.create_task(
                post_agent_event(
                    call_id,
                    "context_tool_called",
                    speaker_id=context.userdata.trigger_speaker_id,
                    model=MODEL_NAME,
                    metadata={"query": query, "error": str(e)[:200]},
                )
            )
            return "Meeting context is temporarily unavailable."

        asyncio.create_task(
            post_agent_event(
                call_id,
                "context_tool_called",
                speaker_id=context.userdata.trigger_speaker_id,
                model=MODEL_NAME,
                metadata={"query": query, "segments": len(segments)},
            )
        )

        if not segments:
            return "No transcript context is available for this call yet."

        lines = []
        total_chars = 0
        for segment in segments:
            speaker = segment.get("speakerName") or "Participant"
            sequence = segment.get("sequence", 0)
            content = " ".join(str(segment.get("content", "")).split())[:300]
            line = f"[{speaker} #{sequence}] {content}"
            if total_chars + len(line) > 4000:
                break
            lines.append(line)
            total_chars += len(line) + 1

        return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
async def entrypoint(ctx: JobContext):
    global MODEL_NAME
    logger.info(f"Connecting to room: {ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # ── Room metadata ──────────────────────────────────────────────────────
    room_metadata = {}
    if ctx.room.metadata:
        try:
            room_metadata = json.loads(ctx.room.metadata)
        except Exception:
            logger.warning("Could not parse LiveKit room metadata as JSON")

    participant_metadata = {}
    for participant in ctx.room.remote_participants.values():
        attributes = getattr(participant, "attributes", None) or {}
        if isinstance(attributes, dict) and attributes.get("callId"):
            participant_metadata = dict(attributes)
            break

        raw_metadata = getattr(participant, "metadata", None)
        if not raw_metadata:
            continue

        try:
            parsed_metadata = json.loads(raw_metadata)
        except Exception:
            continue

        if isinstance(parsed_metadata, dict) and parsed_metadata.get("callId"):
            participant_metadata = parsed_metadata
            break

    call_id      = room_metadata.get("callId") or participant_metadata.get("callId", "")
    custom_prompt = (
        room_metadata.get("aiPrompt")
        or participant_metadata.get("aiPrompt")
        or DEFAULT_SYSTEM_PROMPT
    )

    if not call_id:
        logger.warning(
            "No callId found in LiveKit room metadata or participant attributes; "
            "transcript persistence is disabled"
        )
    else:
        logger.info(f"Transcript persistence enabled for call {call_id}")

    transcript_sequence = 0

    def next_transcript_sequence() -> int:
        nonlocal transcript_sequence
        transcript_sequence += 1
        return transcript_sequence

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
        MODEL_NAME = "gemini-2.5-flash"
        logger.info("LLM: Google Gemini 2.5 Flash (v1beta)")
    else:
        llm_instance = openai.LLM(model="gpt-4o-mini")
        MODEL_NAME = "gpt-4o-mini"
        logger.info("LLM: OpenAI GPT-4o-mini")

    if os.getenv("CARTESIA_API_KEY"):
        tts = cartesia.TTS()
        logger.info("TTS: Cartesia")
    else:
        tts = openai.TTS(voice="alloy")
        logger.info("TTS: OpenAI")

    agent = LexisAgent(
        instructions=custom_prompt + CONTEXT_TOOL_PROMPT,
        vad=vad,
        stt=stt,
        llm=llm_instance,
        tts=tts,
        allow_interruptions=True,
    )

    session = AgentSession[LexisUserData](
        userdata=LexisUserData(call_id=call_id),
        vad=vad,
        stt=stt,
        llm=llm_instance,
        tts=tts,
        allow_interruptions=True,
        turn_handling={"preemptive_generation": {"enabled": False}},
    )

    async def handle_llm_metrics(metrics: LLMMetrics) -> None:
        if getattr(metrics, "cancelled", False):
            return

        metadata = getattr(metrics, "metadata", None)
        model = getattr(metadata, "model_name", None) or MODEL_NAME
        input_tokens = int(getattr(metrics, "prompt_tokens", 0) or 0)
        output_tokens = int(getattr(metrics, "completion_tokens", 0) or 0)
        latency_ms = float(getattr(metrics, "duration", 0) or 0) * 1000
        logger.info(
            f"LLM metrics: model={model} input={input_tokens} "
            f"output={output_tokens} latency={latency_ms:.0f}ms"
        )

        await post_agent_event(
            call_id,
            "llm_call_completed",
            speaker_id=session.userdata.trigger_speaker_id,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            metadata={"request_id": getattr(metrics, "request_id", "")},
        )

    def on_llm_metrics(metrics: LLMMetrics) -> None:
        asyncio.create_task(handle_llm_metrics(metrics))

    llm_instance.on("metrics_collected", on_llm_metrics)

    # ── Handle "mute ai" / "unmute ai" data messages from frontend ─────────
    @ctx.room.on("data_received")
    def on_data(data_packet):
        try:
            msg = json.loads(bytes(data_packet.data).decode())
            if msg.get("type") == "mute_ai":
                session.userdata.ai_muted = bool(msg.get("muted", False))
                logger.info(f"AI mute state → {session.userdata.ai_muted}")
        except Exception:
            pass

    # ── Transcript handler: persist every turn; hard gate handles replies ──
    @session.on("user_input_transcribed")
    def on_user_transcribed(event: UserInputTranscribedEvent):
        if not event.is_final or not event.transcript.strip():
            return

        transcript = event.transcript.strip()

        speaker_id   = getattr(event, "speaker_id", "") or ""
        speaker_name = "Participant"
        if speaker_id and speaker_id in ctx.room.remote_participants:
            p = ctx.room.remote_participants[speaker_id]
            speaker_name = p.name or p.identity

        session.userdata.trigger_speaker_id = speaker_id

        if call_id:
            timestamp_ms = int(time.time() * 1000)
            asyncio.create_task(
                post_transcript_segment(
                    call_id=call_id,
                    speaker_id=speaker_id,
                    speaker_name=speaker_name,
                    text=transcript,
                    is_ai=False,
                    sequence=next_transcript_sequence(),
                    start_time=timestamp_ms,
                    end_time=timestamp_ms,
                )
            )

        logger.info(f"[{speaker_name}]: {transcript}")

        if session.userdata.ai_muted:
            logger.info("AI is muted — hard gate will block the turn")
            return

        if not contains_wake_word(transcript):
            logger.info("Transcript-only turn — hard gate will block LLM")
            return

        if not strip_wake_word(transcript):
            logger.info("Bare wake word — TTS-only acknowledgement")
            asyncio.create_task(session.say("Yes? How can I help?"))
            return

        logger.info("Wake word detected — hard gate will allow one LLM turn")

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
            timestamp_ms = int(time.time() * 1000)
            asyncio.create_task(
                post_transcript_segment(
                    call_id=call_id,
                    speaker_id="ai_agent",
                    speaker_name="Lexis AI",
                    text=text,
                    is_ai=True,
                    sequence=next_transcript_sequence(),
                    start_time=timestamp_ms,
                    end_time=timestamp_ms,
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
