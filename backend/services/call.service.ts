import prisma from "../prisma";
import { LexisRoomMetadata, setLiveKitRoomMetadata } from "./livekit.service";

interface RoomLike {
  id: string;
  code: string;
  liveKitRoomId: string;
  aiEnabled: boolean;
  aiPrompt: string | null;
}

interface CallLike {
  id: string;
}

export const getOrCreateActiveCall = async (
  roomId: string,
  userId: string
): Promise<{ room: RoomLike; call: CallLike } | null> => {
  const room = await prisma.room.findFirst({
    where: {
      OR: [{ id: roomId }, { code: roomId.toLowerCase() }],
    },
  });

  if (!room) return null;

  let call = await prisma.call.findFirst({
    where: {
      roomId: room.id,
      status: "active",
    },
    orderBy: { startedAt: "desc" },
  });

  if (!call) {
    call = await prisma.call.create({
      data: {
        roomId: room.id,
        status: "active",
        startedAt: new Date(),
      },
    });
  }

  const activeParticipant = await prisma.callParticipant.findFirst({
    where: {
      callId: call.id,
      userId,
      leftAt: null,
    },
  });

  if (!activeParticipant) {
    await prisma.callParticipant.create({
      data: {
        callId: call.id,
        userId,
        joinedAt: new Date(),
      },
    });
  }

  return { room, call };
};

export const syncLiveKitRoomMetadata = async (
  room: RoomLike,
  call: CallLike
): Promise<LexisRoomMetadata> => {
  const metadata: LexisRoomMetadata = {
    callId: call.id,
    roomId: room.id,
    roomCode: room.code,
    aiEnabled: room.aiEnabled,
    aiPrompt: room.aiPrompt,
  };

  await setLiveKitRoomMetadata(room.liveKitRoomId, metadata);
  return metadata;
};
