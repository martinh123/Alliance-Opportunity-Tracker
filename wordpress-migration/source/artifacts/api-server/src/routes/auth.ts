import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { createSessionCookie, clearSessionCookie, getUserIdFromCookie, createBearerToken } from "../lib/auth.js";
import { verifyPassword } from "../lib/password";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.setHeader("Set-Cookie", createSessionCookie(user.id));
  req.log.info({ userId: user.id }, "User logged in");

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      quota: user.quota ? Number(user.quota) : null,
      region: user.region,
      createdAt: user.createdAt.toISOString(),
    },
    // Bearer token for mobile clients that cannot use cookies
    token: createBearerToken(user.id),
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.sendStatus(204);
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = getUserIdFromCookie(req.headers.cookie);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    quota: user.quota ? Number(user.quota) : null,
    region: user.region,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
