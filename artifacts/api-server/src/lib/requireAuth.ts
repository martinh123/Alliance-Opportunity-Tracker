import { type Request, type Response } from "express";
import { getUserIdFromCookie, getUserIdFromBearer } from "./auth.js";

export function requireAuth(req: Request, res: Response): number | null {
  // Accept bearer tokens (mobile/API clients) or HMAC-signed session cookies (web)
  const userId =
    getUserIdFromBearer(req.headers.authorization) ??
    getUserIdFromCookie(req.headers.cookie);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return userId;
}
