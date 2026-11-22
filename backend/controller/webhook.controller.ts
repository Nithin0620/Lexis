import { Request, Response } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import prisma from "../prisma";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

/**
 * POST /api/livekit/webhook
 *
 * Receives signed webhook events from LiveKit Cloud.
 * Must be mounted with a raw body parser so the SHA-256 signature check succeeds.
 *
 * Handled events:
 *  - participant_left  → set CallParticipant.leftAt if still null
 *  - room_finished     → mark Call as completed and stamp endedAt
 */
export const handleLiveKitWebhook = async (req: Request, res: Response) => {
  try {
    // req.body is a raw Buffer when express.raw() is used on this route.
    // Convert to string for the receiver.
    const rawBody = req.body instanceof Buffer ? req.body.toString("utf-8") : req.body;
    const authHeader = req.headers["authorization"] as string | undefined;

    let event;
    try {
      event = await receiver.receive(rawBody, authHeader);
    } catch (verifyError) {
      console.error("LiveKit webhook signature verification failed:", verifyError);
      return res.status(401).json({ error: "Webhook signature invalid" });
    }

    const eventName = event.event;

    // ------------------------------------------------------------------ //
    //  participant_left — a user disconnected (tab closed, network drop)   //
    // ------------------------------------------------------------------ //
    if (eventName === "participant_left") {
      const participant = event.participant;
      const room = event.room;

      if (!participant || !room) {
        return res.status(200).json({ received: true });
      }

      // LiveKit participant identity is set to the user's database userId
      // when the token is generated in room.controller.ts (grants.identity).
      const userId = participant.identity;
      const liveKitRoomId = room.name; // LiveKit room name == our room.liveKitRoomId

      if (!userId || !liveKitRoomId) {
        return res.status(200).json({ received: true });
      }

      // Find the matching Room record
      const dbRoom = await prisma.room.findFirst({
        where: { liveKitRoomId },
      });

      if (!dbRoom) {
        return res.status(200).json({ received: true });
      }

      // Find the active Call in that room
      const activeCall = await prisma.call.findFirst({
        where: { roomId: dbRoom.id, status: "active" },
      });

      if (!activeCall) {
        return res.status(200).json({ received: true });
      }

      // Stamp leftAt on the matching participant record (if not already set)
      await prisma.callParticipant.updateMany({
        where: {
          callId: activeCall.id,
          userId,
          leftAt: null,
        },
        data: {
          leftAt: new Date(),
        },
      });

      console.log(
        `[webhook] participant_left: userId=${userId} callId=${activeCall.id}`
      );
    }

    // ------------------------------------------------------------------ //
    //  room_finished — the LiveKit room has closed (all participants gone) //
    // ------------------------------------------------------------------ //
    if (eventName === "room_finished") {
      const room = event.room;

      if (!room) {
        return res.status(200).json({ received: true });
      }

      const liveKitRoomId = room.name;

      const dbRoom = await prisma.room.findFirst({
        where: { liveKitRoomId },
      });

      if (!dbRoom) {
        return res.status(200).json({ received: true });
      }

      const now = new Date();

      // Mark the active call as completed
      const updatedCall = await prisma.call.updateMany({
        where: { roomId: dbRoom.id, status: "active" },
        data: { status: "completed", endedAt: now },
      });

      if (updatedCall.count > 0) {
        // Find the call we just updated to stamp any remaining open participants
        const completedCall = await prisma.call.findFirst({
          where: { roomId: dbRoom.id, status: "completed", endedAt: now },
        });

        if (completedCall) {
          await prisma.callParticipant.updateMany({
            where: { callId: completedCall.id, leftAt: null },
            data: { leftAt: now },
          });
        }
      }

      console.log(
        `[webhook] room_finished: liveKitRoomId=${liveKitRoomId} roomId=${dbRoom.id}`
      );
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("LiveKit webhook handler error:", error);
    // Always return 200 to prevent LiveKit from retrying on internal errors
    return res.status(200).json({ received: true, error: "Internal processing error" });
  }
};
