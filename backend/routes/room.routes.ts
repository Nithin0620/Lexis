import { Router } from "express";
import {
  createRoom,
  joinRoomByCode,
  getMyRooms,
  getRoomDetails,
  updateRoom,
  deleteRoom,
  getLiveKitToken,
} from "../controller/room.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

// All room routes require authentication
router.use(authenticate);

// Room management
router.post("/", createRoom);
router.post("/join", joinRoomByCode);
router.get("/my", getMyRooms);
router.get("/:identifier", getRoomDetails);
router.put("/:id", updateRoom);
router.delete("/:id", deleteRoom);

// WebRTC LiveKit Token
router.post("/token", getLiveKitToken);

export default router;
