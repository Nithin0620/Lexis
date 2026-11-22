import { Response } from "express";
import prisma from "../prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { generateMeetingSummaryFromTranscript } from "../services/ai.service";

/**
 * 1. Start a Call in a Room
 * If an active call already exists in the room, returns the existing active call.
 * Automatically adds the user as a CallParticipant.
 */
export const startCall = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const room = await prisma.room.findFirst({
      where: {
        OR: [{ id: roomId }, { code: (roomId as string).toLowerCase() }],
      },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Verify user is a member of the room
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: req.user.id,
          roomId: room.id,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "You must join this room first" });
    }

    // Check for an existing active call
    let call = await prisma.call.findFirst({
      where: {
        roomId: room.id,
        status: "active",
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });

    if (!call) {
      // Create new call
      call = await prisma.call.create({
        data: {
          roomId: room.id,
          status: "active",
          startedAt: new Date(),
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
      });
    }

    // Add current user to participants if not already in call
    const activeParticipant = await prisma.callParticipant.findFirst({
      where: {
        callId: call.id,
        userId: req.user.id,
        leftAt: null,
      },
    });

    if (!activeParticipant) {
      await prisma.callParticipant.create({
        data: {
          callId: call.id,
          userId: req.user.id,
          joinedAt: new Date(),
        },
      });
    }

    return res.status(200).json({
      message: "Call started / active",
      call,
    });
  } catch (error) {
    console.error("Start call error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 2. Join an active Call
 */
export const joinCall = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({ error: "callId is required" });
    }

    const call = await prisma.call.findUnique({
      where: { id: callId },
    });

    if (!call || call.status !== "active") {
      return res.status(404).json({ error: "Active call not found" });
    }

    // Check if participant is already actively in the call
    let participant = await prisma.callParticipant.findFirst({
      where: {
        callId: call.id,
        userId: req.user.id,
        leftAt: null,
      },
    });

    if (!participant) {
      participant = await prisma.callParticipant.create({
        data: {
          callId: call.id,
          userId: req.user.id,
          joinedAt: new Date(),
        },
      });
    }

    return res.json({
      message: "Joined call successfully",
      participant,
    });
  } catch (error) {
    console.error("Join call error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 3. Leave a Call
 */
export const leaveCall = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({ error: "callId is required" });
    }

    // Mark user's active session in this call as left
    await prisma.callParticipant.updateMany({
      where: {
        callId,
        userId: req.user.id,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    return res.json({ message: "Left call successfully" });
  } catch (error) {
    console.error("Leave call error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 4. End a Call (Host only or Room member)
 */
export const endCall = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = req.params.id as string;

    if (!id) {
      return res.status(400).json({ error: "Call id is required" });
    }

    const call = await prisma.call.findUnique({
      where: { id },
      include: { room: true },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    const now = new Date();

    // Mark call as completed
    const updatedCall = await prisma.call.update({
      where: { id },
      data: {
        status: "completed",
        endedAt: now,
      },
    });

    // Mark all remaining participants as left
    await prisma.callParticipant.updateMany({
      where: {
        callId: id,
        leftAt: null,
      },
      data: {
        leftAt: now,
      },
    });

    return res.json({
      message: "Call ended successfully",
      call: updatedCall,
    });
  } catch (error) {
    console.error("End call error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 5. Get Call Details, Per-Participant Stats & Meeting Summary
 */
export const getCallDetails = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = req.params.id as string;

    const call = await prisma.call.findUnique({
      where: { id },
      include: {
        room: {
          select: { id: true, name: true, code: true },
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
        transcript: {
          include: {
            segments: {
              orderBy: { sequence: "asc" },
            },
          },
        },
        meetingSummary: true,
        aiUsages: true,
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    return res.json({ call });
  } catch (error) {
    console.error("Get call details error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 6. Save a Transcript Segment & Auto-Update Participant Speaking Stats
 */
export const saveTranscriptSegment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      callId,
      speakerId,
      speakerName,
      content,
      startTime,
      endTime,
      sequence,
      isAi,
    } = req.body;

    if (!callId || !content) {
      return res.status(400).json({ error: "callId and content are required" });
    }

    const speakerUserId = speakerId || (isAi ? null : req.user.id);
    const duration = Math.max(0, (Number(endTime) || 0) - (Number(startTime) || 0));
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

    // 1. Ensure Transcript record exists for the call
    let transcript = await prisma.transcript.findUnique({
      where: { callId },
    });

    if (!transcript) {
      transcript = await prisma.transcript.create({
        data: {
          callId,
          fullText: "",
        },
      });
    }

    // 2. Create the TranscriptSegment
    const segment = await prisma.transcriptSegment.create({
      data: {
        transcriptId: transcript.id,
        speakerId: speakerUserId,
        speakerName: speakerName || (isAi ? "Lexis AI" : req.user.name),
        content: content.trim(),
        startTime: Number(startTime) || 0,
        endTime: Number(endTime) || 0,
        sequence: Number(sequence) || 0,
        isAi: Boolean(isAi),
      },
    });

    // 3. Update Participant Stats (speakingSeconds & wordsSpoken)
    if (speakerUserId && !isAi) {
      const participant = await prisma.callParticipant.findFirst({
        where: {
          callId,
          userId: speakerUserId,
        },
      });

      if (participant) {
        await prisma.callParticipant.update({
          where: { id: participant.id },
          data: {
            speakingSeconds: { increment: Math.round(duration) },
            wordsSpoken: { increment: wordCount },
          },
        });
      }
    }

    // 4. Append to fullText
    const updatedText = transcript.fullText
      ? `${transcript.fullText}\n${segment.speakerName}: ${segment.content}`
      : `${segment.speakerName}: ${segment.content}`;

    await prisma.transcript.update({
      where: { id: transcript.id },
      data: { fullText: updatedText },
    });

    return res.status(201).json({
      message: "Transcript segment saved",
      segment,
    });
  } catch (error) {
    console.error("Save transcript segment error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 7. Get Full Call Transcript
 */
export const getCallTranscript = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const callId = req.params.callId as string;

    const transcript = await prisma.transcript.findUnique({
      where: { callId },
      include: {
        segments: {
          orderBy: { sequence: "asc" },
        },
      },
    });

    if (!transcript) {
      return res.status(404).json({ error: "Transcript not found for this call" });
    }

    return res.json({ transcript });
  } catch (error) {
    console.error("Get call transcript error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 8. Save or Update Generated Meeting Summary Document
 */
export const saveMeetingSummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { callId, overview, decisions, actionItems, participantNotes } = req.body;

    if (!callId || !overview) {
      return res.status(400).json({ error: "callId and overview are required" });
    }

    const summary = await prisma.meetingSummary.upsert({
      where: { callId },
      create: {
        callId,
        overview,
        decisions: decisions || [],
        actionItems: actionItems || [],
        participantNotes: participantNotes || {},
      },
      update: {
        overview,
        decisions: decisions || [],
        actionItems: actionItems || [],
        participantNotes: participantNotes || {},
      },
    });

    return res.json({
      message: "Meeting summary saved successfully",
      summary,
    });
  } catch (error) {
    console.error("Save meeting summary error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 9. Trigger LLM to Analyze Transcript and Generate Structured Meeting Summary
 */
export const generateCallSummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = req.params.id as string;

    if (!id) {
      return res.status(400).json({ error: "Call id is required" });
    }

    const call = await prisma.call.findUnique({
      where: { id },
      include: {
        transcript: true,
        participants: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    if (!call.transcript || !call.transcript.fullText || !call.transcript.fullText.trim()) {
      return res.status(400).json({
        error: "Call has no transcript to summarize. Participants must speak before generating a summary.",
      });
    }

    const participantNames = call.participants.map((p) => p.user.name);

    // Call the LLM service to analyze transcript
    const summaryResult = await generateMeetingSummaryFromTranscript(
      call.transcript.fullText,
      participantNames
    );

    // Save into MeetingSummary table
    const savedSummary = await prisma.meetingSummary.upsert({
      where: { callId: id },
      create: {
        callId: id,
        overview: summaryResult.overview,
        decisions: summaryResult.decisions,
        actionItems: summaryResult.actionItems,
        participantNotes: summaryResult.participantNotes,
      },
      update: {
        overview: summaryResult.overview,
        decisions: summaryResult.decisions,
        actionItems: summaryResult.actionItems,
        participantNotes: summaryResult.participantNotes,
      },
    });

    // Record AI token usage metric in database
    await prisma.aIUsage.create({
      data: {
        callId: id,
        userId: req.user.id !== "service-agent" ? req.user.id : null,
        model: summaryResult.modelUsed,
        inputTokens: summaryResult.inputTokens,
        outputTokens: summaryResult.outputTokens,
        estimatedCost: summaryResult.estimatedCost,
      },
    });

    return res.json({
      message: "Meeting summary generated successfully",
      summary: savedSummary,
      metrics: {
        model: summaryResult.modelUsed,
        inputTokens: summaryResult.inputTokens,
        outputTokens: summaryResult.outputTokens,
        estimatedCost: summaryResult.estimatedCost,
      },
    });
  } catch (error) {
    console.error("Generate call summary error:", error);
    return res.status(500).json({ error: "Internal server error generating summary" });
  }
};
