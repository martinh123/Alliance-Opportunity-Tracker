import { Router } from "express";
import { db, opportunitiesTable, partnersTable, usersTable, companyResearchTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  ListOpportunitiesQueryParams,
  CreateOpportunityBody,
  GetOpportunityParams,
  UpdateOpportunityParams,
  UpdateOpportunityBody,
  DeleteOpportunityParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

export function formatOpp(o: any) {
  return {
    id: o.id,
    name: o.name,
    type: o.type,
    partnerId: o.partnerId,
    partnerName: o.partnerName ?? null,
    ownerId: o.ownerId,
    ownerName: o.ownerName ?? null,
    stage: o.stage,
    country: o.country ?? null,
    dateIn: o.dateIn ?? null,
    hpeTeam: o.hpeTeam ?? null,
    partnerContact: o.partnerContact ?? null,
    partnerContactRole: o.partnerContactRole ?? null,
    numEndpoints: o.numEndpoints ?? null,
    useCase: o.useCase ?? null,
    endCustomer: o.endCustomer ?? null,
    endCustomerDomain: o.endCustomerDomain ?? null,
    revenueValue: o.revenueValue != null ? Number(o.revenueValue) : null,
    closeDate: o.closeDate ?? null,
    description: o.description ?? null,
    notes: Array.isArray(o.notes) ? o.notes : [],
    contacts: Array.isArray(o.contacts) ? o.contacts : [],
    meddpiccScore: o.meddpiccScore != null ? Number(o.meddpiccScore) : null,
    closedWonAt: o.closedWonAt instanceof Date ? o.closedWonAt.toISOString() : (o.closedWonAt ?? null),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
  };
}

export const withJoins = {
  id: opportunitiesTable.id,
  name: opportunitiesTable.name,
  type: opportunitiesTable.type,
  partnerId: opportunitiesTable.partnerId,
  partnerName: partnersTable.name,
  ownerId: opportunitiesTable.ownerId,
  ownerName: usersTable.name,
  stage: opportunitiesTable.stage,
  country: opportunitiesTable.country,
  dateIn: opportunitiesTable.dateIn,
  hpeTeam: opportunitiesTable.hpeTeam,
  partnerContact: opportunitiesTable.partnerContact,
  partnerContactRole: opportunitiesTable.partnerContactRole,
  numEndpoints: opportunitiesTable.numEndpoints,
  useCase: opportunitiesTable.useCase,
  endCustomer: opportunitiesTable.endCustomer,
  endCustomerDomain: opportunitiesTable.endCustomerDomain,
  revenueValue: opportunitiesTable.revenueValue,
  closeDate: opportunitiesTable.closeDate,
  description: opportunitiesTable.description,
  notes: opportunitiesTable.notes,
  contacts: opportunitiesTable.contacts,
  meddpiccScore: opportunitiesTable.meddpiccScore,
  closedWonAt: opportunitiesTable.closedWonAt,
  createdAt: opportunitiesTable.createdAt,
  updatedAt: opportunitiesTable.updatedAt,
};

router.get("/opportunities", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const qp = ListOpportunitiesQueryParams.safeParse(req.query);
  if (!qp.success) { res.status(400).json({ error: qp.error.message }); return; }

  const { partnerId, type, stage, ownerId, closeDateFrom, closeDateTo } = qp.data;

  const rows = await db
    .select(withJoins)
    .from(opportunitiesTable)
    .leftJoin(partnersTable, eq(opportunitiesTable.partnerId, partnersTable.id))
    .leftJoin(usersTable, eq(opportunitiesTable.ownerId, usersTable.id))
    .where(
      and(
        partnerId != null ? eq(opportunitiesTable.partnerId, partnerId) : undefined,
        type ? eq(opportunitiesTable.type, type) : undefined,
        stage ? eq(opportunitiesTable.stage, stage) : undefined,
        ownerId != null ? eq(opportunitiesTable.ownerId, ownerId) : undefined,
        closeDateFrom ? gte(opportunitiesTable.closeDate, closeDateFrom) : undefined,
        closeDateTo ? lte(opportunitiesTable.closeDate, closeDateTo) : undefined,
      )
    )
    .orderBy(opportunitiesTable.createdAt);

  res.json(rows.map(formatOpp));
});

router.post("/opportunities", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = CreateOpportunityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { revenueValue, ...rest } = parsed.data;
  const [opp] = await db.insert(opportunitiesTable).values({
    ...rest,
    revenueValue: revenueValue != null ? String(revenueValue) : null,
  }).returning();

  const [full] = await db.select(withJoins).from(opportunitiesTable)
    .leftJoin(partnersTable, eq(opportunitiesTable.partnerId, partnersTable.id))
    .leftJoin(usersTable, eq(opportunitiesTable.ownerId, usersTable.id))
    .where(eq(opportunitiesTable.id, opp.id));

  res.status(201).json(formatOpp(full));
});

router.get("/opportunities/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = GetOpportunityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [opp] = await db.select(withJoins).from(opportunitiesTable)
    .leftJoin(partnersTable, eq(opportunitiesTable.partnerId, partnersTable.id))
    .leftJoin(usersTable, eq(opportunitiesTable.ownerId, usersTable.id))
    .where(eq(opportunitiesTable.id, params.data.id));

  if (!opp) { res.status(404).json({ error: "Opportunity not found" }); return; }
  res.json(formatOpp(opp));
});

router.patch("/opportunities/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = UpdateOpportunityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateOpportunityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { revenueValue, ...rest } = parsed.data;
  const updates: any = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && k in opportunitiesTable) updates[k] = v;
  }
  if (revenueValue !== undefined) updates.revenueValue = revenueValue != null ? String(revenueValue) : null;

  // Auto-set closedWonAt when stage transitions to ClosedWon (and not already set)
  if (updates.stage === "ClosedWon" && !updates.closedWonAt) {
    const [existing] = await db.select({ closedWonAt: opportunitiesTable.closedWonAt })
      .from(opportunitiesTable).where(eq(opportunitiesTable.id, params.data.id));
    if (existing && !existing.closedWonAt) {
      updates.closedWonAt = new Date();
    }
  }

  // If the end customer (or its domain) changes, the stored company research is
  // now for the wrong company — clear it so it isn't shown as stale. The rep can
  // regenerate fresh context from the detail page.
  let clearResearch = false;
  if ("endCustomer" in updates || "endCustomerDomain" in updates) {
    const [existing] = await db.select({
      endCustomer: opportunitiesTable.endCustomer,
      endCustomerDomain: opportunitiesTable.endCustomerDomain,
    }).from(opportunitiesTable).where(eq(opportunitiesTable.id, params.data.id));
    if (existing) {
      const nextCustomer = "endCustomer" in updates ? updates.endCustomer : existing.endCustomer;
      const nextDomain = "endCustomerDomain" in updates ? updates.endCustomerDomain : existing.endCustomerDomain;
      if ((nextCustomer ?? null) !== (existing.endCustomer ?? null) ||
          (nextDomain ?? null) !== (existing.endCustomerDomain ?? null)) {
        clearResearch = true;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    const [current] = await db.select(withJoins).from(opportunitiesTable)
      .leftJoin(partnersTable, eq(opportunitiesTable.partnerId, partnersTable.id))
      .leftJoin(usersTable, eq(opportunitiesTable.ownerId, usersTable.id))
      .where(eq(opportunitiesTable.id, params.data.id));
    if (!current) { res.status(404).json({ error: "Opportunity not found" }); return; }
    res.json(formatOpp(current));
    return;
  }

  await db.update(opportunitiesTable).set(updates).where(eq(opportunitiesTable.id, params.data.id));

  if (clearResearch) {
    await db.delete(companyResearchTable).where(eq(companyResearchTable.opportunityId, params.data.id));
  }

  const [opp] = await db.select(withJoins).from(opportunitiesTable)
    .leftJoin(partnersTable, eq(opportunitiesTable.partnerId, partnersTable.id))
    .leftJoin(usersTable, eq(opportunitiesTable.ownerId, usersTable.id))
    .where(eq(opportunitiesTable.id, params.data.id));

  if (!opp) { res.status(404).json({ error: "Opportunity not found" }); return; }
  res.json(formatOpp(opp));
});

router.delete("/opportunities/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = DeleteOpportunityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [opp] = await db.delete(opportunitiesTable).where(eq(opportunitiesTable.id, params.data.id)).returning();
  if (!opp) { res.status(404).json({ error: "Opportunity not found" }); return; }
  res.sendStatus(204);
});

export default router;
