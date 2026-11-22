import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.routes";
import roomRoutes from "./routes/room.routes";
import callRoutes from "./routes/call.routes";
import webhookRoutes from "./routes/webhook.routes";
import userRoutes from "./routes/user.routes";
import { errorMiddleware } from "./middlewares/error.middleware";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// ── CORS — only allow requests from the configured frontend origin ─────────
const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

app.use(express.json());

// ── Rate limiters for auth endpoints ──────────────────────────────────────
// 10 requests per minute per IP on login and register to block brute-force.
const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Too many attempts. Please try again in a minute.",
  },
});

// ── Health routes ─────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "success", message: "Lexis API is running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "200", message: "Server is running", Database: "Connected" });
});

// ── API routes ────────────────────────────────────────────────────────────
// Rate limiter applied to just the two auth endpoints that accept credentials.
app.use("/api/auth/login", authRateLimiter);
app.use("/api/auth/register", authRateLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/users", userRoutes);

// LiveKit webhook — route uses express.raw() internally for signature verification.
app.use("/api/livekit", webhookRoutes);

// ── Global error handler — MUST be last ───────────────────────────────────
app.use(errorMiddleware);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
