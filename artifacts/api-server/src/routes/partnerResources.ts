import { Router } from "express";
import { db, partnerResourcesTable, partnersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListPartnerResourcesQueryParams,
  CreatePartnerResourceBody,
  UpdatePartnerResourceParams,
  UpdatePartnerResourceBody,
  DeletePartnerResourceParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

/**
 * Would setting `resourceId`'s manager to `managerId` create a cycle?
 * Walks the manager chain upward from the proposed manager (within the same
 * partner); if we ever reach the resource itself, the assignment would loop.
 */
async function wouldCreateCycle(partnerId: number, resourceId: number, managerId: number): Promise<boolean> {
  const rows = await db
    .select({ id: partnerResourcesTable.id, managerId: partnerResourcesTable.managerId })
    .from(partnerResourcesTable)
    .where(eq(partnerResourcesTable.partnerId, partnerId));
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
    partnerId: r.partnerId,
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

/** Validate a manager assignment: same partner, exists, and marked manager. */
async function validateManager(partnerId: number, managerId: number): Promise<string | null> {
  const [mgr] = await db.select().from(partnerResourcesTable).where(eq(partnerResourcesTable.id, managerId));
  if (!mgr || !mgr.isManager) return "managerId must reference an existing resource marked as manager";
  if (mgr.partnerId !== partnerId) return "managerId must belong to the same partner";
  return null;
}

router.post("/partner-resources/bulk", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const body = req.body as { partnerId?: unknown; rows?: unknown };
  const partnerId = typeof body.partnerId === "number" ? body.partnerId : undefined;
  if (!partnerId) { res.status(400).json({ error: "partnerId is required" }); return; }
  if (!Array.isArray(body.rows)) { res.status(400).json({ error: "rows must be an array" }); return; }

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(400).json({ error: "partnerId must reference an existing partner" }); return; }

  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const existing = await db.select({ name: partnerResourcesTable.name, email: partnerResourcesTable.email })
    .from(partnerResourcesTable).where(eq(partnerResourcesTable.partnerId, partnerId));
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
      await db.insert(partnerResourcesTable).values({
        partnerId,
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

  req.log.info({ partnerId, inserted, skipped, errors: errors.length }, "bulk partner resource import");
  res.json({ inserted, skipped, errors });
});

router.get("/partner-resources", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const query = ListPartnerResourcesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const partnerId = query.data.partnerId;
  const rows = partnerId != null
    ? await db.select().from(partnerResourcesTable).where(eq(partnerResourcesTable.partnerId, partnerId)).orderBy(partnerResourcesTable.name)
    : await db.select().from(partnerResourcesTable).orderBy(partnerResourcesTable.name);
  res.json(rows.map(formatResource));
});

router.post("/partner-resources", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const parsed = CreatePartnerResourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, data.partnerId));
  if (!partner) { res.status(400).json({ error: "partnerId must reference an existing partner" }); return; }
  if (data.managerId != null) {
    const err = await validateManager(data.partnerId, data.managerId);
    if (err) { res.status(400).json({ error: err }); return; }
  }
  const name = data.name.trim();
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  // Duplicate prevention: reuse an existing person with the same normalized
  // name+email at this partner instead of piling up copies (idempotent create).
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const siblings = await db.select().from(partnerResourcesTable).where(eq(partnerResourcesTable.partnerId, data.partnerId));
  const dup = siblings.find((r) => norm(r.name) === norm(name) && norm(r.email) === norm(data.email));
  if (dup) { res.status(200).json(formatResource(dup)); return; }
  const [row] = await db.insert(partnerResourcesTable).values({ ...data, name }).returning();
  res.status(201).json(formatResource(row));
});

router.patch("/partner-resources/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = UpdatePartnerResourceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePartnerResourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [current] = await db.select().from(partnerResourcesTable).where(eq(partnerResourcesTable.id, params.data.id));
  if (!current) { res.status(404).json({ error: "Partner resource not found" }); return; }

  const updates: Record<string, any> = {};
  if (typeof parsed.data.name === "string" && !parsed.data.name.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined && k in partnerResourcesTable) updates[k] = v;
  }

  if (updates.managerId != null) {
    if (updates.managerId === params.data.id) { res.status(400).json({ error: "A resource cannot be its own manager" }); return; }
    const err = await validateManager(current.partnerId, updates.managerId);
    if (err) { res.status(400).json({ error: err }); return; }
    if (await wouldCreateCycle(current.partnerId, params.data.id, updates.managerId)) {
      res.status(400).json({ error: "This manager assignment would create a reporting cycle" });
      return;
    }
  }

  if (Object.keys(updates).length === 0) {
    res.json(formatResource(current));
    return;
  }

  const [row] = await db.update(partnerResourcesTable).set(updates).where(eq(partnerResourcesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Partner resource not found" }); return; }

  // If this resource is no longer a manager, detach any direct reports.
  if (updates.isManager === false) {
    await db.update(partnerResourcesTable).set({ managerId: null }).where(eq(partnerResourcesTable.managerId, row.id));
  }

  res.json(formatResource(row));
});

router.delete("/partner-resources/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = DeletePartnerResourceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  // Detach direct reports before removing their manager.
  await db.update(partnerResourcesTable).set({ managerId: null }).where(eq(partnerResourcesTable.managerId, params.data.id));
  const [row] = await db.delete(partnerResourcesTable).where(eq(partnerResourcesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Partner resource not found" }); return; }
  res.sendStatus(204);
});

export default router;
