import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "gsi-tracker-dev-secret-change-in-prod";
const COOKIE_NAME = "gsi_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sign(payload: string): string {
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function unsign(token: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const expected = sign(payload);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Bearer tokens are long-lived (30 days) for mobile clients that can't use cookies.
const BEARER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createBearerToken(userId: number): string {
  const payload = `bearer:${userId}:${Date.now()}`;
  return sign(payload);
}

export function getUserIdFromBearer(authHeader: string | undefined): number | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const payload = unsign(token);
  if (!payload) return null;
  if (!payload.startsWith("bearer:")) return null;
  const parts = payload.split(":");
  if (parts.length !== 3) return null;
  const userId = Number(parts[1]);
  const ts = Number(parts[2]);
  if (isNaN(userId) || isNaN(ts)) return null;
  if (Date.now() - ts > BEARER_MAX_AGE_MS) return null;
  return userId;
}

export function createSessionCookie(userId: number): string {
  const payload = `${userId}:${Date.now()}`;
  const token = sign(payload);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_MS / 1000}; Path=/`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`;
}

export function getUserIdFromCookie(cookieHeader: string | undefined): number | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  const payload = unsign(raw);
  if (!payload) return null;
  const [userIdStr, tsStr] = payload.split(":");
  const ts = Number(tsStr);
  if (Date.now() - ts > MAX_AGE_MS) return null;
  const userId = Number(userIdStr);
  return isNaN(userId) ? null : userId;
}
