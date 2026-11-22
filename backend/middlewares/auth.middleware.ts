import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    avatar?: string | null;
  };
  isService?: boolean;
}

interface JwtPayload {
  userId: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key";
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "lexis_internal_service_secret_2026";

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Check for Internal Service Key (used by LiveKit Agent worker)
    const serviceToken = req.headers["x-service-token"] as string;
    if (serviceToken && serviceToken === INTERNAL_SERVICE_KEY) {
      req.isService = true;
      req.user = {
        id: "service-agent",
        email: "agent@lexis.internal",
        name: "Lexis Agent Service",
      };
      return next();
    }

    // 2. Check for User JWT Bearer Token
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, avatar: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found or token invalid." });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};
