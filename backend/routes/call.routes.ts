import { Router } from "express";
import {
  startCall,
  joinCall,
  leaveCall,
  endCall,
  getCallDetails,
  saveTranscriptSegment,
  getCallTranscript,
  saveMeetingSummary,
} from "../controller/call.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

// All call routes require authentication
router.use(authenticate);

// Call lifecycle
router.post("/start", startCall);
router.post("/join", joinCall);
router.post("/leave", leaveCall);
router.put("/:id/end", endCall);
router.get("/:id", getCallDetails);

// Transcripts
router.post("/transcript/segment", saveTranscriptSegment);
router.get("/:callId/transcript", getCallTranscript);

// Meeting Summary Document
router.post("/summary", saveMeetingSummary);

export default router;
