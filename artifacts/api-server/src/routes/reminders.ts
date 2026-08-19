import { Router } from "express";
import { db, remindersTable } from "@workspace/db";
import { and, asc, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { CreateReminderBody, UpdateReminderBody, DeleteReminderParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

function formatReminder(r: any) {
  return {
    id: r.id,
    name: r.name,
    dueAt: r.dueAt instanceof Date ? r.dueAt.toISOString() : r.dueAt,
    entityType: r.entityType ?? null,
    entityId: r.entityId ?? null,
    entityLabel: r.entityLabel ?? null,
    notes: r.notes ?? null,
    completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : (r.completedAt ?? null),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

router.get("/reminders", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  if (!["open", "completed", "all"].includes(status)) {
    res.status(400).json({ error: "status must be one of: open, completed, all" });
    return;
  }
  const conditions = [eq(remindersTable.userId, userId)];
  if (status === "open") conditions.push(isNull(remindersTable.completedAt));
  else if (status === "completed") conditions.push(isNotNull(remindersTable.completedAt));
  const rows = await db
    .select()
    .from(remindersTable)
    .where(and(...conditions))
    .orderBy(
      status === "completed" ? desc(remindersTable.completedAt) : asc(remindersTable.dueAt),
    );
  res.json(rows.map(formatReminder));
});

router.post("/reminders", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = CreateReminderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { name, dueAt, entityType, entityId, entityLabel, notes } = parsed.data as any;
  if (!name.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) { res.status(400).json({ error: "dueAt must be a valid date/time" }); return; }
  const [row] = await db
    .insert(remindersTable)
    .values({
      userId,
      name: name.trim(),
      dueAt: due,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      entityLabel: entityLabel ?? null,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    })
    .returning();
  res.status(201).json(formatReminder(row));
});

router.patch("/reminders/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const params = DeleteReminderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateReminderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const body = parsed.data as { name?: string; dueAt?: string; notes?: string | null; completed?: boolean; entityType?: string | null; entityId?: string | null; entityLabel?: string | null };

  const updates: Record<string, any> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) { res.status(400).json({ error: "name cannot be blank" }); return; }
    updates.name = body.name.trim();
  }
  if (body.dueAt !== undefined) {
    const due = new Date(body.dueAt);
    if (isNaN(due.getTime())) { res.status(400).json({ error: "dueAt must be a valid date/time" }); return; }
    updates.dueAt = due;
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes && body.notes.trim() ? body.notes.trim() : null;
  }
  if (body.completed !== undefined) {
    updates.completedAt = body.completed ? new Date() : null;
  }
  if (body.entityType !== undefined) {
    updates.entityType = body.entityType ?? null;
  }
  if (body.entityId !== undefined) {
    updates.entityId = body.entityId ?? null;
  }
  if (body.entityLabel !== undefined) {
    updates.entityLabel = body.entityLabel ?? null;
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [row] = await db
    .update(remindersTable)
    .set(updates)
    .where(and(eq(remindersTable.id, params.data.id), eq(remindersTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Reminder not found" }); return; }
  res.json(formatReminder(row));
});

router.delete("/reminders/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const params = DeleteReminderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const deleted = await db
    .delete(remindersTable)
    .where(and(eq(remindersTable.id, params.data.id), eq(remindersTable.userId, userId)))
    .returning({ id: remindersTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Reminder not found" }); return; }
  res.status(204).end();
});

export default router;
