import { Router } from "express";
import express from "express";
import { handleLiveKitWebhook } from "../controller/webhook.controller";

const router = Router();

/**
 * POST /api/livekit/webhook
 *
 * express.raw() is applied only to this route so that the raw Buffer is
 * available for LiveKit's SHA-256 signature verification.
 * The global express.json() parser is intentionally NOT used here.
 */
router.post(
  "/webhook",
  express.raw({ type: "application/webhook+json" }),
  handleLiveKitWebhook
);

export default router;
