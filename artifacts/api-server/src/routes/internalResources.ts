import { Router } from "express";
import { db, internalResourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateInternalResourceBody,
  UpdateInternalResourceParams,
  UpdateInternalResourceBody,
  DeleteInternalResourceParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

/**
 * Would setting `resourceId`'s manager to `managerId` create a cycle?
 * Walks the manager chain upward from the proposed manager; if we ever reach
 * the resource itself, the assignment would loop.
 */
async function wouldCreateCycle(resourceId: number, managerId: number): Promise<boolean> {
  const rows = await db.select({ id: internalResourcesTable.id, managerId: internalResourcesTable.managerId }).from(internalResourcesTable);
  const parentOf = new Map(rows.map((r) => [r.id, r.managerId]));
  let current: number | null | undefined = managerId;
  const seen = new Set<number>();
  while (current != null) {
    if (current === resourceId) return true;
    if (seen.has(current)) return true; // pre-existing cycle in data — refuse to extend it
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}

function formatResource(r: any) {
  return {
    id: r.id,
    name: r.name,
    func: r.func,
    email: r.email,
    phone: r.phone,
    location: r.location,
    isManager: !!r.isManager,
    managerId: r.managerId,
    notes: Array.isArray(r.notes) ? r.notes : [],
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

router.post("/internal-resources/bulk", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const body = req.body as { rows?: unknown };
  if (!Array.isArray(body.rows)) { res.status(400).json({ error: "rows must be an array" }); return; }

  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const existing = await db.select({ name: internalResourcesTable.name, email: internalResourcesTable.email })
    .from(internalResourcesTable);
  const existingSet = new Set(existing.map((r) => `${norm(r.name)}|${norm(r.email)}`));

  let inserted = 0, skipped = 0;
  const errors: string[] = [];

  for (const raw of body.rows) {
    const row = raw as Record<string, any>;
    const name = String(row.name ?? "").trim();
    if (!name) { skipped++; continue; }

    const email = row.email ? String(row.email).trim() : null;
    const dedupKey = `${norm(name)}|${norm(email)}`;
    if (existingSet.has(dedupKey)) { skipped++; continue; }

    try {
      const notesText = row.notes ? String(row.notes).trim() : null;
      await db.insert(internalResourcesTable).values({
        name,
        func: row.func ? String(row.func).trim() : null,
        email: email || null,
        phone: row.phone ? String(row.phone).trim() : null,
        location: row.location ? String(row.location).trim() : null,
        isManager: row.isManager === true || row.isManager === "true" || row.isManager === 1,
        notes: notesText ? [{ id: crypto.randomUUID(), text: notesText, createdAt: new Date().toISOString() }] : [],
      });
      existingSet.add(dedupKey);
      inserted++;
    } catch (err: any) {
      errors.push(`Row "${name}": ${err?.message ?? "insert failed"}`);
    }
  }

  req.log.info({ inserted, skipped, errors: errors.length }, "bulk internal resource import");
  res.json({ inserted, skipped, errors });
});

router.get("/internal-resources", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(internalResourcesTable).orderBy(internalResourcesTable.name);
  res.json(rows.map(formatResource));
});

router.post("/internal-resources", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const parsed = CreateInternalResourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  if (data.managerId != null) {
    const [mgr] = await db.select().from(internalResourcesTable).where(eq(internalResourcesTable.id, data.managerId));
    if (!mgr || !mgr.isManager) { res.status(400).json({ error: "managerId must reference an existing resource marked as manager" }); return; }
  }
  const name = data.name.trim();
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  // Duplicate prevention: reuse an existing person with the same normalized
  // name+email instead of piling up copies (idempotent create).
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const all = await db.select().from(internalResourcesTable);
  const dup = all.find((r) => norm(r.name) === norm(name) && norm(r.email) === norm(data.email));
  if (dup) { res.status(200).json(formatResource(dup)); return; }
  const [row] = await db.insert(internalResourcesTable).values({ ...data, name }).returning();
  res.status(201).json(formatResource(row));
});

router.patch("/internal-resources/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = UpdateInternalResourceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateInternalResourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, any> = {};
  if (typeof parsed.data.name === "string" && !parsed.data.name.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined && k in internalResourcesTable) updates[k] = v;
  }

  if (updates.managerId != null) {
    if (updates.managerId === params.data.id) { res.status(400).json({ error: "A resource cannot be its own manager" }); return; }
    const [mgr] = await db.select().from(internalResourcesTable).where(eq(internalResourcesTable.id, updates.managerId));
    if (!mgr || !mgr.isManager) { res.status(400).json({ error: "managerId must reference an existing resource marked as manager" }); return; }
    if (await wouldCreateCycle(params.data.id, updates.managerId)) {
      res.status(400).json({ error: "This manager assignment would create a reporting cycle" });
      return;
    }
  }

  if (Object.keys(updates).length === 0) {
    const [current] = await db.select().from(internalResourcesTable).where(eq(internalResourcesTable.id, params.data.id));
    if (!current) { res.status(404).json({ error: "Internal resource not found" }); return; }
    res.json(formatResource(current));
    return;
  }

  const [row] = await db.update(internalResourcesTable).set(updates).where(eq(internalResourcesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Internal resource not found" }); return; }

  // If this resource is no longer a manager, detach any direct reports.
  if (updates.isManager === false) {
    await db.update(internalResourcesTable).set({ managerId: null }).where(eq(internalResourcesTable.managerId, row.id));
  }

  res.json(formatResource(row));
});

router.delete("/internal-resources/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = DeleteInternalResourceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  // Detach direct reports before removing their manager.
  await db.update(internalResourcesTable).set({ managerId: null }).where(eq(internalResourcesTable.managerId, params.data.id));
  const [row] = await db.delete(internalResourcesTable).where(eq(internalResourcesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Internal resource not found" }); return; }
  res.sendStatus(204);
});

export default router;
