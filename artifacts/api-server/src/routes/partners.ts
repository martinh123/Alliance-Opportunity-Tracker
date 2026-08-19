import { Router } from "express";
import { db, partnersTable, partnerResourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePartnerBody, GetPartnerParams, UpdatePartnerParams, UpdatePartnerBody, DeletePartnerParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

/** primaryContactId must reference a partner_resources row of the same partner. */
async function validatePrimaryContact(primaryContactId: number, partnerId: number | null): Promise<string | null> {
  const [r] = await db.select().from(partnerResourcesTable).where(eq(partnerResourcesTable.id, primaryContactId));
  if (!r) return "Primary contact not found in partner resources";
  if (partnerId != null && r.partnerId !== partnerId) return "Primary contact belongs to a different partner";
  return null;
}

function formatPartner(p: any) {
  return {
    id: p.id,
    name: p.name,
    tier: p.tier,
    region: p.region,
    contactName: p.contactName,
    contactEmail: p.contactEmail,
    primaryContactId: p.primaryContactId ?? null,
    notes: Array.isArray(p.notes) ? p.notes : [],
    revenueTarget: p.revenueTarget != null ? Number(p.revenueTarget) : null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

router.get("/partners", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const partners = await db.select().from(partnersTable).orderBy(partnersTable.name);
  res.json(partners.map(formatPartner));
});

router.post("/partners", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const parsed = CreatePartnerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { revenueTarget, ...rest } = parsed.data;
  const values: any = { ...rest };
  if (revenueTarget != null) values.revenueTarget = String(revenueTarget);
  // A brand-new partner has no resources yet, so a primary contact can't be valid.
  if (values.primaryContactId != null) { res.status(400).json({ error: "Set the primary contact after the partner has people" }); return; }
  const [partner] = await db.insert(partnersTable).values(values).returning();
  res.status(201).json(formatPartner(partner));
});

router.get("/partners/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = GetPartnerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, params.data.id));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  res.json(formatPartner(partner));
});

router.patch("/partners/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = UpdatePartnerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePartnerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Filter to only columns that exist on the table and have defined values
  // revenueTarget is numeric in DB — must be stored as string
  const updates: Record<string, any> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined && k in partnersTable) {
      updates[k] = (k === "revenueTarget" && v != null) ? String(v) : v;
    }
  }
  if (updates.primaryContactId != null) {
    const err = await validatePrimaryContact(updates.primaryContactId, params.data.id);
    if (err) { res.status(400).json({ error: err }); return; }
  }
  if (Object.keys(updates).length === 0) {
    // Nothing to update — return current record
    const [current] = await db.select().from(partnersTable).where(eq(partnersTable.id, params.data.id));
    if (!current) { res.status(404).json({ error: "Partner not found" }); return; }
    res.json(formatPartner(current));
    return;
  }

  const [partner] = await db.update(partnersTable).set(updates).where(eq(partnersTable.id, params.data.id)).returning();
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  res.json(formatPartner(partner));
});

router.delete("/partners/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = DeletePartnerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [partner] = await db.delete(partnersTable).where(eq(partnersTable.id, params.data.id)).returning();
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  res.sendStatus(204);
});

export default router;
