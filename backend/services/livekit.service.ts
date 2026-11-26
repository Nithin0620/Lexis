import { RoomServiceClient } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://127.0.0.1:7880";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";

export interface LexisRoomMetadata {
  callId: string;
  roomId: string;
  roomCode: string;
  aiEnabled: boolean;
  aiPrompt: string | null;
}

let roomServiceClient: RoomServiceClient | null = null;

const getRoomServiceClient = (): RoomServiceClient => {
  if (!roomServiceClient) {
    roomServiceClient = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    );
  }

  return roomServiceClient;
};

const getErrorCode = (error: unknown): { status?: number; code?: string } => {
  if (typeof error !== "object" || error === null) return {};

  const candidate = error as { status?: number; code?: string };
  return { status: candidate.status, code: candidate.code };
};

const isNotFoundError = (error: unknown): boolean => {
  const { status, code } = getErrorCode(error);
  return status === 404 || code === "not_found";
};

const isAlreadyExistsError = (error: unknown): boolean => {
  const { status, code } = getErrorCode(error);
  return status === 409 || code === "already_exists";
};

export const setLiveKitRoomMetadata = async (
  roomName: string,
  metadata: LexisRoomMetadata
): Promise<void> => {
  const client = getRoomServiceClient();
  const serializedMetadata = JSON.stringify(metadata);

  try {
    await client.updateRoomMetadata(roomName, serializedMetadata);
    return;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  try {
    await client.createRoom({ name: roomName, metadata: serializedMetadata });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    await client.updateRoomMetadata(roomName, serializedMetadata);
  }
};
