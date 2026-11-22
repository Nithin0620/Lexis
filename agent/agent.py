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
from livekit.plugins import silero, openai, deepgram, cartesia

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lexis-voice-agent")

BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://localhost:5000/api")

DEFAULT_SYSTEM_PROMPT = """
You are Lexis, an intelligent voice AI participant in a group meeting call.
You are helpful, concise, and natural in conversation.
Since you are in a live group call with multiple human participants:
- Keep your answers concise, direct, and conversational (avoid lengthy monologues).
- Help answer questions, summarize discussions, and clarify points when addressed.
- Always be polite, professional, and friendly.
"""

async def post_transcript_segment(call_id: str, speaker_id: str, speaker_name: str, text: str, is_ai: bool = False):
    """
    Sends transcribed speech to the Express backend to be stored in PostgreSQL
    and update participant speaking statistics.
    """
    if not call_id or not text.strip():
        return

    url = f"{BACKEND_API_URL}/calls/transcript/segment"
    payload = {
        "callId": call_id,
        "speakerId": speaker_id,
        "speakerName": speaker_name,
        "content": text.strip(),
        "isAi": is_ai,
        "startTime": 0,
        "endTime": 0,
    }

    try:
        async with aiohttp.ClientSession() as session:
            headers = {"Content-Type": "application/json"}
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status in (200, 201):
                    logger.info(f"Saved segment from {speaker_name}: '{text[:30]}...'")
                else:
                    logger.warning(f"Backend returned status {resp.status} saving transcript segment")
    except Exception as e:
        logger.error(f"Failed to post transcript segment to backend: {e}")

async def entrypoint(ctx: JobContext):
    logger.info(f"Connecting to room: {ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Participant setup: Extract room and call identifiers from metadata
    room_metadata = {}
    if ctx.room.metadata:
        try:
            room_metadata = json.loads(ctx.room.metadata)
        except Exception:
            pass

    call_id = room_metadata.get("callId", "")
    custom_prompt = room_metadata.get("aiPrompt") or DEFAULT_SYSTEM_PROMPT

    # 1. Voice Activity Detection (VAD)
    vad = silero.VAD.load()

    # 2. Speech-to-Text (STT)
    if os.getenv("DEEPGRAM_API_KEY"):
        stt = deepgram.STT()
        logger.info("Using Deepgram STT")
    else:
        stt = openai.STT()
        logger.info("Using OpenAI STT")

    # 3. Large Language Model (LLM)
    llm_instance = openai.LLM(model="gpt-4o-mini")

    # 4. Text-to-Speech (TTS)
    if os.getenv("CARTESIA_API_KEY"):
        tts = cartesia.TTS()
        logger.info("Using Cartesia TTS")
    else:
        tts = openai.TTS(voice="alloy")
        logger.info("Using OpenAI TTS")

    # 5. Define Agent instructions
    agent = Agent(
        instructions=custom_prompt,
        vad=vad,
        stt=stt,
        llm=llm_instance,
        tts=tts,
        allow_interruptions=True,
    )

    # 6. Initialize AgentSession
    session = AgentSession(
        vad=vad,
        stt=stt,
        llm=llm_instance,
        tts=tts,
        allow_interruptions=True,
    )

    # Track finalized user speech
    @session.on("user_input_transcribed")
    def on_user_transcribed(event: UserInputTranscribedEvent):
        if not event.is_final or not event.transcript.strip():
            return

        speaker_name = "Participant"
        speaker_id = event.speaker_id or ""

        # Match speaker identity from remote participants
        if speaker_id and speaker_id in ctx.room.remote_participants:
            p = ctx.room.remote_participants[speaker_id]
            speaker_name = p.name or p.identity

        if call_id:
            asyncio.create_task(
                post_transcript_segment(
                    call_id=call_id,
                    speaker_id=speaker_id,
                    speaker_name=speaker_name,
                    text=event.transcript,
                    is_ai=False,
                )
            )

    # Track conversation items (including AI responses)
    @session.on("conversation_item_added")
    def on_item_added(event: ConversationItemAddedEvent):
        item = event.item
        if hasattr(item, "role") and item.role == "assistant":
            text = ""
            if hasattr(item, "content"):
                if isinstance(item.content, str):
                    text = item.content
                elif isinstance(item.content, list):
                    text = " ".join([str(c) for c in item.content])

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

    # Start session in the room
    await session.start(agent, room=ctx.room)

    # Greet the room
    await session.say("Hello everyone! I'm Lexis, your AI assistant for this call.")

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
