import { Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserIdFromCookie } from "./auth";

export interface AdminUser {
  id: number;
  email: string;
}

/**
 * Gate a route to admin users only. Returns the admin user record on success,
 * or null after sending the appropriate 401/403 response. Use the same
 * early-return pattern as requireAuth: `const admin = await requireAdmin(req, res); if (!admin) return;`
 */
export async function requireAdmin(req: Request, res: Response): Promise<AdminUser | null> {
  const userId = getUserIdFromCookie(req.headers.cookie);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }

  return { id: user.id, email: user.email };
}
