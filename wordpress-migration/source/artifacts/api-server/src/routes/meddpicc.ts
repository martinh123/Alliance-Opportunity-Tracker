import { Router } from "express";
import { db, meddpiccEntriesTable, opportunitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetMeddpiccParams,
  CreateMeddpiccEntryBody,
  UpdateMeddpiccEntryParams,
  UpdateMeddpiccEntryBody,
  DeleteMeddpiccEntryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

const MEDDPICC_ELEMENTS = [
  "metrics", "economic_buyer", "decision_criteria", "decision_process",
  "paper_process", "identify_pain", "champion", "competition",
];

// Relative importance of each element toward the overall qualification score.
// Weights sum to 100. The four elements most predictive of a winnable deal
// (the value case, who signs, the pain that drives urgency, and the internal
// seller) carry more weight than the procedural elements.
const ELEMENT_WEIGHTS: Record<string, number> = {
  metrics: 15,
  economic_buyer: 15,
  identify_pain: 15,
  champion: 15,
  decision_criteria: 10,
  decision_process: 10,
  paper_process: 10,
  competition: 10,
};

// Per-element strength on a 0..1 scale, blending three signals:
//   presence   (0.40) — any information has been captured for the element
//   validation (0.40) — share of entries confirmed by the customer
//   relevance  (0.20) — average self-rated relevance (1-5) of the entries
// An element with a single unvalidated, mid-relevance note scores ~0.52;
// full credit requires customer-validated, highly relevant information.
function elementStrength(entries: { customerValidated: boolean; relevanceScore: number | null }[]): number {
  if (entries.length === 0) return 0;
  const validatedRatio = entries.filter((e) => e.customerValidated).length / entries.length;
  const avgRelevance = entries.reduce((sum, e) => sum + (e.relevanceScore ?? 3), 0) / entries.length;
  return 0.4 + 0.4 * validatedRatio + 0.2 * (avgRelevance / 5);
}

// Weighted overall score (0-100) across all elements.
function overallFromEntries(entries: { element: string; customerValidated: boolean; relevanceScore: number | null }[]): number {
  let total = 0;
  for (const element of MEDDPICC_ELEMENTS) {
    const elementEntries = entries.filter((e) => e.element === element);
    total += (ELEMENT_WEIGHTS[element] ?? 0) * elementStrength(elementEntries);
  }
  return total; // weights sum to 100, strengths are 0..1 → already 0-100
}

function formatEntry(e: any) {
  return {
    id: e.id,
    opportunityId: e.opportunityId,
    element: e.element,
    content: e.content,
    customerValidated: e.customerValidated,
    relevanceScore: e.relevanceScore ?? null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
  };
}

router.get("/opportunities/:id/meddpicc", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = GetMeddpiccParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const entries = await db.select().from(meddpiccEntriesTable)
    .where(eq(meddpiccEntriesTable.opportunityId, params.data.id))
    .orderBy(meddpiccEntriesTable.createdAt);

  const grouped = MEDDPICC_ELEMENTS.map((element) => {
    const elementEntries = entries.filter((e) => e.element === element);
    const validatedCount = elementEntries.filter((e) => e.customerValidated).length;
    const completionPct = elementEntries.length > 0
      ? (validatedCount / elementEntries.length) * 100
      : 0;
    const score = elementStrength(elementEntries) * 100;
    return { element, entries: elementEntries.map(formatEntry), completionPct, score, weight: ELEMENT_WEIGHTS[element] ?? 0 };
  });

  const overallScore = overallFromEntries(entries);

  res.json({ opportunityId: params.data.id, overallScore, elements: grouped });
});

router.post("/meddpicc-entries", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = CreateMeddpiccEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [entry] = await db.insert(meddpiccEntriesTable).values(parsed.data).returning();
  await recalculateMeddpiccScore(parsed.data.opportunityId);
  res.status(201).json(formatEntry(entry));
});

router.patch("/meddpicc-entries/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = UpdateMeddpiccEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateMeddpiccEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [entry] = await db.update(meddpiccEntriesTable).set(parsed.data)
    .where(eq(meddpiccEntriesTable.id, params.data.id)).returning();

  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  await recalculateMeddpiccScore(entry.opportunityId);
  res.json(formatEntry(entry));
});

router.delete("/meddpicc-entries/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = DeleteMeddpiccEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [entry] = await db.delete(meddpiccEntriesTable)
    .where(eq(meddpiccEntriesTable.id, params.data.id)).returning();

  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  await recalculateMeddpiccScore(entry.opportunityId);
  res.sendStatus(204);
});

async function recalculateMeddpiccScore(opportunityId: number) {
  const entries = await db.select().from(meddpiccEntriesTable)
    .where(eq(meddpiccEntriesTable.opportunityId, opportunityId));
  const score = overallFromEntries(entries);
  await db.update(opportunitiesTable).set({ meddpiccScore: String(score) })
    .where(eq(opportunitiesTable.id, opportunityId));
}

export default router;
