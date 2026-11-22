import { Response } from "express";
import prisma from "../prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

/**
 * GET /api/users/analytics
 *
 * Returns lifetime participation stats for the authenticated user,
 * plus a list of their last 5 meetings with summary overviews.
 *
 * Response shape:
 * {
 *   lifetime: {
 *     totalMeetings: number,
 *     totalSpeakingSeconds: number,
 *     totalSpeakingMinutes: number,
 *     totalWordsSpoken: number,
 *     totalAiInteractions: number,
 *     totalAiCost: number,
 *   },
 *   recentMeetings: Array<{
 *     callId: string,
 *     roomName: string,
 *     startedAt: Date,
 *     endedAt: Date | null,
 *     durationMinutes: number | null,
 *     summaryOverview: string | null,
 *     speakingSeconds: number,
 *     wordsSpoken: number,
 *   }>
 * }
 */
export const getUserAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.id;

    // Run all aggregation queries in parallel
    const [
      totalMeetings,
      speakingAgg,
      aiUsageAgg,
      recentParticipations,
    ] = await Promise.all([
      // 1. Count of calls this user participated in
      prisma.callParticipant.count({
        where: { userId },
      }),

      // 2. Sum speaking time, words, AI interactions
      prisma.callParticipant.aggregate({
        where: { userId },
        _sum: {
          speakingSeconds: true,
          wordsSpoken: true,
          aiInteractions: true,
        },
      }),

      // 3. Sum AI token cost attributed to this user
      prisma.aIUsage.aggregate({
        where: { userId },
        _sum: { estimatedCost: true },
      }),

      // 4. Last 5 call participations with call + room + summary data
      prisma.callParticipant.findMany({
        where: { userId },
        orderBy: { joinedAt: "desc" },
        take: 5,
        select: {
          speakingSeconds: true,
          wordsSpoken: true,
          joinedAt: true,
          leftAt: true,
          call: {
            select: {
              id: true,
              startedAt: true,
              endedAt: true,
              status: true,
              room: {
                select: { name: true, code: true },
              },
              meetingSummary: {
                select: { overview: true },
              },
            },
          },
        },
      }),
    ]);

    const totalSpeakingSeconds = speakingAgg._sum.speakingSeconds ?? 0;
    const totalWordsSpoken = speakingAgg._sum.wordsSpoken ?? 0;
    const totalAiInteractions = speakingAgg._sum.aiInteractions ?? 0;
    const totalAiCost = aiUsageAgg._sum.estimatedCost ?? 0;

    const recentMeetings = recentParticipations.map((p) => {
      const call = p.call;
      let durationMinutes: number | null = null;

      if (call.startedAt && call.endedAt) {
        const diffMs = call.endedAt.getTime() - call.startedAt.getTime();
        durationMinutes = Math.round(diffMs / 60000);
      }

      return {
        callId: call.id,
        roomName: call.room.name,
        roomCode: call.room.code,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        status: call.status,
        durationMinutes,
        summaryOverview: call.meetingSummary?.overview ?? null,
        speakingSeconds: p.speakingSeconds,
        wordsSpoken: p.wordsSpoken,
      };
    });

    return res.json({
      lifetime: {
        totalMeetings,
        totalSpeakingSeconds,
        totalSpeakingMinutes: Math.round(totalSpeakingSeconds / 60),
        totalWordsSpoken,
        totalAiInteractions,
        totalAiCost: parseFloat(totalAiCost.toFixed(6)),
      },
      recentMeetings,
    });
  } catch (error) {
    console.error("Get user analytics error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
