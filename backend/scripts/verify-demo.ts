import "dotenv/config";
import prisma from "../prisma";

type Args = {
  callId?: string;
  passiveEnd?: Date;
};

const parseArgs = (): Args => {
  const args = process.argv.slice(2);
  const result: Args = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    if (!value) continue;

    if (key === "--call-id") {
      result.callId = value;
    }

    if (key === "--passive-end") {
      const numeric = Number(value);
      const parsed =
        Number.isFinite(numeric) && numeric > 0
          ? new Date(numeric)
          : new Date(value);

      if (!Number.isNaN(parsed.getTime())) {
        result.passiveEnd = parsed;
      }
    }
  }

  return result;
};

const main = async () => {
  const { callId, passiveEnd } = parseArgs();

  if (!callId) {
    console.error("Usage: npx tsx scripts/verify-demo.ts --call-id <id> [--passive-end <ISO|ms>]");
    process.exitCode = 1;
    return;
  }

  try {
    const [call, segments, events, usages, participants] = await Promise.all([
      prisma.call.findUnique({
        where: { id: callId },
        select: { id: true, status: true, startedAt: true, endedAt: true },
      }),
      prisma.transcriptSegment.findMany({
        where: { transcript: { callId } },
        select: {
          speakerName: true,
          content: true,
          sequence: true,
          startTime: true,
          isAi: true,
        },
        orderBy: { sequence: "asc" },
      }),
      prisma.agentEvent.findMany({
        where: { callId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.aIUsage.findMany({
        where: { callId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.callParticipant.findMany({
        where: { callId },
        select: {
          userId: true,
          wordsSpoken: true,
          speakingSeconds: true,
          aiInteractions: true,
        },
      }),
    ]);

    const countEvent = (eventType: string) =>
      events.filter((event) => event.eventType === eventType).length;

    const counts = {
      wake_word_hit: countEvent("wake_word_hit"),
      llm_call_started: countEvent("llm_call_started"),
      llm_call_completed: countEvent("llm_call_completed"),
      context_tool_called: countEvent("context_tool_called"),
      false_trigger_blocked: countEvent("false_trigger_blocked"),
      ai_muted_turn: countEvent("ai_muted_turn"),
    };

    const passiveEvents = passiveEnd
      ? events.filter((event) => event.createdAt.getTime() < passiveEnd.getTime())
      : [];
    const passiveSegments = passiveEnd
      ? segments.filter(
          (segment) => segment.startTime > 0 && segment.startTime < passiveEnd.getTime()
        )
      : [];

    const passive = passiveEnd
      ? {
          transcriptSegments: passiveSegments.length,
          llmStarts: passiveEvents.filter(
            (event) => event.eventType === "llm_call_started"
          ).length,
          llmCompletions: passiveEvents.filter(
            (event) => event.eventType === "llm_call_completed"
          ).length,
          falseTriggersBlocked: passiveEvents.filter(
            (event) => event.eventType === "false_trigger_blocked"
          ).length,
        }
      : null;

    const checks = [
      { name: "call exists", ok: Boolean(call) },
      { name: "transcript segments persisted", ok: segments.length > 0 },
      { name: "wake word hit recorded", ok: counts.wake_word_hit > 0 },
      { name: "LLM start recorded", ok: counts.llm_call_started > 0 },
      { name: "LLM completion recorded", ok: counts.llm_call_completed > 0 },
      { name: "context tool called", ok: counts.context_tool_called > 0 },
      { name: "AIUsage row written", ok: usages.length > 0 },
      {
        name: "participant aiInteractions incremented",
        ok: participants.some((participant) => participant.aiInteractions > 0),
      },
    ];

    if (passiveEnd) {
      checks.push(
        {
          name: "zero LLM starts before wake word",
          ok: passive?.llmStarts === 0,
        },
        {
          name: "zero LLM completions before wake word",
          ok: passive?.llmCompletions === 0,
        },
        {
          name: "passive transcript segments stored",
          ok: (passive?.transcriptSegments ?? 0) > 0,
        }
      );
    }

    const ok = checks.every((check) => check.ok);

    console.log(
      JSON.stringify(
        {
          callId,
          generatedAt: new Date().toISOString(),
          passiveEnd: passiveEnd?.toISOString() ?? null,
          counts,
          passive,
          totals: {
            transcriptSegments: segments.length,
            aiSegments: segments.filter((segment) => segment.isAi).length,
            aiUsageRows: usages.length,
            inputTokens: usages.reduce((sum, usage) => sum + usage.inputTokens, 0),
            outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
            estimatedCost: usages.reduce(
              (sum, usage) => sum + usage.estimatedCost,
              0
            ),
          },
          participants,
          checks,
          ok,
        },
        null,
        2
      )
    );

    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
