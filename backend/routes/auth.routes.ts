import { Router } from "express";
import {
  register,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
} from "../controller/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected routes (require Bearer token)
router.get("/me", authenticate, getMe);
router.put("/profile", authenticate, updateProfile);

export default router;
