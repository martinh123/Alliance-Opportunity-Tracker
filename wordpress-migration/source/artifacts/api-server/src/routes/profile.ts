import { Router } from "express";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

function formatProfile(p: any) {
  return {
    id: p.id,
    userId: p.userId,
    revenueMetric: p.revenueMetric,
    fiscalYearStart: p.fiscalYearStart,
    fiscalYearEnd: p.fiscalYearEnd,
    quota: p.quota ? Number(p.quota) : null,
    q1GoalPct: p.q1GoalPct != null ? Number(p.q1GoalPct) : 25,
    q2GoalPct: p.q2GoalPct != null ? Number(p.q2GoalPct) : 25,
    q3GoalPct: p.q3GoalPct != null ? Number(p.q3GoalPct) : 25,
    q4GoalPct: p.q4GoalPct != null ? Number(p.q4GoalPct) : 25,
  };
}

router.get("/profile", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
  if (!profile) {
    const [created] = await db.insert(profilesTable).values({ userId }).returning();
    profile = created;
  }
  res.json(formatProfile(profile));
});

router.patch("/profile", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { quota, q1GoalPct, q2GoalPct, q3GoalPct, q4GoalPct, ...rest } = parsed.data;
  const updates: any = { ...rest };
  if (quota !== undefined) updates.quota = quota != null ? String(quota) : null;
  if (q1GoalPct !== undefined) updates.q1GoalPct = q1GoalPct != null ? String(q1GoalPct) : null;
  if (q2GoalPct !== undefined) updates.q2GoalPct = q2GoalPct != null ? String(q2GoalPct) : null;
  if (q3GoalPct !== undefined) updates.q3GoalPct = q3GoalPct != null ? String(q3GoalPct) : null;
  if (q4GoalPct !== undefined) updates.q4GoalPct = q4GoalPct != null ? String(q4GoalPct) : null;

  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
  if (!profile) {
    const [created] = await db.insert(profilesTable).values({ userId, ...updates }).returning();
    res.json(formatProfile(created));
    return;
  }

  const [updated] = await db.update(profilesTable).set(updates).where(eq(profilesTable.userId, userId)).returning();
  res.json(formatProfile(updated));
});

export default router;
