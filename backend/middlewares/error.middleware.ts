import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

/**
 * Global error-handling middleware.
 *
 * Must be the LAST middleware registered in server.ts (after all routes).
 * Express identifies it as an error handler because it has 4 parameters.
 *
 * Handled cases:
 *  - Prisma P2002  → 409 Conflict  (unique constraint violation)
 *  - Prisma P2025  → 404 Not Found (record required for update/delete not found)
 *  - Prisma P2003  → 400 Bad Request (foreign key constraint fail)
 *  - Prisma validation error → 400 Bad Request
 *  - Generic Error → 500 Internal Server Error
 */
export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  // ── Prisma known request errors (e.g. constraint violations) ──────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const fields = (err.meta?.target as string[])?.join(", ") ?? "field";
        res.status(409).json({
          error: "Conflict",
          message: `A record with this ${fields} already exists.`,
        });
        return;
      }
      case "P2025":
        res.status(404).json({
          error: "Not Found",
          message: err.meta?.cause ?? "Record not found.",
        });
        return;
      case "P2003":
        res.status(400).json({
          error: "Bad Request",
          message: "Related record does not exist (foreign key constraint failed).",
        });
        return;
      default:
        console.error(`[Prisma error ${err.code}]`, err.message);
        res.status(500).json({
          error: "Database Error",
          message: "An unexpected database error occurred.",
        });
        return;
    }
  }

  // ── Prisma validation errors (bad query shape) ─────────────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("[Prisma validation error]", err.message);
    res.status(400).json({
      error: "Bad Request",
      message: "Invalid data provided.",
    });
    return;
  }

  // ── Standard JS/TS Error ───────────────────────────────────────────────
  if (err instanceof Error) {
    console.error("[Unhandled error]", err.stack ?? err.message);
    res.status(500).json({
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : err.message,
    });
    return;
  }

  // ── Unknown throw value ────────────────────────────────────────────────
  console.error("[Unknown error]", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: "An unexpected error occurred.",
  });
};
