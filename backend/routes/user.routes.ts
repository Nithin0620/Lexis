import { Router } from "express";
import { getUserAnalytics } from "../controller/user.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

// All user routes require authentication
router.use(authenticate);

// GET /api/users/analytics — lifetime stats for the dashboard
router.get("/analytics", getUserAnalytics);

export default router;
