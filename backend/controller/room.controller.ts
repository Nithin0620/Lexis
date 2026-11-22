import { Response } from "express";
import crypto from "crypto";
import { AccessToken } from "livekit-server-sdk";
import prisma from "../prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://127.0.0.1:7880";

/**
 * Generate a short, readable join code e.g. "lex-894-a1b2"
 */
const generateRoomCode = () => {
  const randomHex = crypto.randomBytes(2).toString("hex");
  const randomNum = Math.floor(100 + Math.random() * 900);
  return `lex-${randomNum}-${randomHex}`;
};

/**
 * 1. Create a new Room
 * Automatically adds the creator as "host" in RoomMember
 */
export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, isPrivate, aiEnabled, aiPrompt } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Room name is required" });
    }

    let code = generateRoomCode();
    // Ensure code uniqueness
    let existingCode = await prisma.room.findUnique({ where: { code } });
    while (existingCode) {
      code = generateRoomCode();
      existingCode = await prisma.room.findUnique({ where: { code } });
    }

    const liveKitRoomId = `room-${code}`;

    // Transaction to create room and host member record
    const newRoom = await prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          name: name.trim(),
          code,
          createdBy: req.user!.id,
          liveKitRoomId,
          isPrivate: Boolean(isPrivate),
          aiEnabled: aiEnabled !== undefined ? Boolean(aiEnabled) : true,
          aiPrompt: aiPrompt || null,
        },
      });

      await tx.roomMember.create({
        data: {
          userId: req.user!.id,
          roomId: room.id,
          role: "host",
        },
      });

      return room;
    });

    return res.status(201).json({
      message: "Room created successfully",
      room: newRoom,
    });
  } catch (error) {
    console.error("Create room error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 2. Join a Room using its short code (e.g. "lex-894-a1b2")
 */
export const joinRoomByCode = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { code } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Room code is required" });
    }

    const room = await prisma.room.findUnique({
      where: { code: code.trim().toLowerCase() },
      include: {
        creator: {
          select: { id: true, name: true, avatar: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found with this code" });
    }

    // Check if user is already a member
    let memberRecord = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: req.user.id,
          roomId: room.id,
        },
      },
    });

    if (!memberRecord) {
      memberRecord = await prisma.roomMember.create({
        data: {
          userId: req.user.id,
          roomId: room.id,
          role: "member",
        },
      });
    }

    return res.json({
      message: "Joined room successfully",
      room,
      membership: memberRecord,
    });
  } catch (error) {
    console.error("Join room error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 3. Get Room Details by ID or Code
 */
export const getRoomDetails = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const identifier = req.params.identifier as string;

    if (!identifier) {
      return res.status(400).json({ error: "Room identifier is required" });
    }

    const room = await prisma.room.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier.toLowerCase() }],
      },
      include: {
        creator: {
          select: { id: true, name: true, avatar: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
        calls: {
          where: { status: "active" },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    return res.json({ room });
  } catch (error) {
    console.error("Get room details error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 4. Get all rooms for the authenticated user (created or joined)
 */
export const getMyRooms = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const rooms = await prisma.room.findMany({
      where: {
        members: {
          some: {
            userId: req.user.id,
          },
        },
      },
      include: {
        creator: {
          select: { id: true, name: true, avatar: true },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ rooms });
  } catch (error) {
    console.error("Get my rooms error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 5. Update Room Settings (Only Host / Creator)
 */
export const updateRoom = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = req.params.id as string;
    const { name, isPrivate, aiEnabled, aiPrompt } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Room id is required" });
    }

    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (room.createdBy !== req.user.id) {
      return res.status(403).json({ error: "Only the room host can update settings" });
    }

    const updatedRoom = await prisma.room.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(isPrivate !== undefined && { isPrivate: Boolean(isPrivate) }),
        ...(aiEnabled !== undefined && { aiEnabled: Boolean(aiEnabled) }),
        ...(aiPrompt !== undefined && { aiPrompt }),
      },
    });

    return res.json({
      message: "Room updated successfully",
      room: updatedRoom,
    });
  } catch (error) {
    console.error("Update room error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 6. Delete a Room (Only Host / Creator)
 */
export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = req.params.id as string;

    if (!id) {
      return res.status(400).json({ error: "Room id is required" });
    }

    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (room.createdBy !== req.user.id) {
      return res.status(403).json({ error: "Only the room host can delete this room" });
    }

    await prisma.room.delete({
      where: { id },
    });

    return res.json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("Delete room error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * 7. Generate LiveKit WebRTC Access Token for a Call
 */
export const getLiveKitToken = async (req: AuthRequest, res: Response) => {
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

    // Verify user is a member of this room
    const isMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: req.user.id,
          roomId: room.id,
        },
      },
    });

    if (!isMember) {
      return res.status(403).json({ error: "You must join this room before connecting to the call" });
    }

    // Generate LiveKit Access Token
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: req.user.id,
      name: req.user.name,
    });

    at.addGrant({
      room: room.liveKitRoomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return res.json({
      token,
      serverUrl: LIVEKIT_URL,
      roomName: room.liveKitRoomId,
    });
  } catch (error) {
    console.error("LiveKit token error:", error);
    return res.status(500).json({ error: "Internal server error generating LiveKit token" });
  }
};
