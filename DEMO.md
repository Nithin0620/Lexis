# Lexis Demo Proof

This is the repeatable proof for the wake-word-gated, transcript-first architecture.

## Goal

Show that normal three-person conversation creates transcript rows but no LLM calls, and that one explicit wake-word question triggers exactly one gated turn, a context-tool lookup, a spoken answer, and persisted usage telemetry.

## Prerequisites

```bash
cd backend
npx prisma migrate dev
npm run dev
```

```bash
cd agent
source venv/bin/activate
python agent.py download-files
python agent.py dev 2>&1 | tee agent.log
```

```bash
cd frontend
npm run dev
```

## Run

1. Open three browser profiles or devices and join the same room code.
2. Record the `callId` from the `POST /api/rooms/token` response, or read `activeCall.id` from `GET /api/rooms/:code`.
3. For 60-90 seconds, speak naturally without saying Lexis. Include one clear decision, for example: "We decided to move the launch to Friday."
4. Record the exact epoch milliseconds when the passive phase ends, just before saying the wake phrase.

   ```bash
   date +%s%3N
   ```

5. Say: "Lexis, what did we decide?"
6. Wait for Lexis to answer from the retrieved transcript.
7. End the call.
8. Verify the database evidence.

   ```bash
   cd backend
   npx tsx scripts/verify-demo.ts \
     --call-id <call-id> \
     --passive-end <epoch-ms>
   ```

## Expected Evidence

The verification script prints JSON and exits non-zero if an assertion fails. Expected values:

| Check | Expected |
| :--- | :--- |
| `passive.transcriptSegments` | Greater than 0 |
| `passive.llmStarts` | 0 |
| `passive.llmCompletions` | 0 |
| `counts.wake_word_hit` | At least 1 |
| `counts.llm_call_started` | At least 1 |
| `counts.context_tool_called` | At least 1 |
| `totals.inputTokens` / `totals.outputTokens` | Greater than 0 |
| `totals.aiUsageRows` | At least 1 |
| `participant.aiInteractions` | At least 1 for the speaker who asked |

## Log Evidence

Capture these lines from `agent.log`:

```bash
grep -E "Transcript-only turn|Hard gate: blocked turn|Hard gate: wake word accepted|get_meeting_context|LLM metrics" agent.log
```

Expected sequence:

```text
Transcript-only turn — hard gate will block LLM
Hard gate: blocked turn without wake word: '...'
Wake word detected — hard gate will allow one LLM turn
Hard gate: wake word accepted — 'what did we decide?'
get_meeting_context(query='what did we decide?', limit=20)
LLM metrics: model=... input=... output=... latency=...ms
```

## Screenshots To Capture

1. Agent log showing blocked passive turns and no `LLM metrics` lines before the wake phrase.
2. Agent log showing the accepted wake turn, `get_meeting_context`, and `LLM metrics`.
3. Verification script output with `ok: true`.
4. Optional short screen recording of the full flow.
