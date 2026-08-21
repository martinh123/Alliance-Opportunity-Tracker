import { Router } from "express";
import { db, opportunitiesTable, partnersTable, meddpiccEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

const MEDDPICC_ELEMENTS = [
  "metrics", "economic_buyer", "decision_criteria", "decision_process",
  "paper_process", "identify_pain", "champion", "competition",
];

function getCurrentQuarterRange() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const qs = new Date(year, Math.floor(month / 3) * 3, 1);
  const qe = new Date(year, Math.floor(month / 3) * 3 + 3, 0);
  return { from: qs.toISOString().split("T")[0], to: qe.toISOString().split("T")[0] };
}

function getCurrentFiscalYearRange() {
  const now = new Date();
  const year = now.getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const quarter = getCurrentQuarterRange();
  const fiscal = getCurrentFiscalYearRange();
  const all = await db.select().from(opportunitiesTable);

  const totalPipelineValue = all
    .filter((o) => o.stage !== "ClosedLost")
    .reduce((s, o) => s + (o.revenueValue ? Number(o.revenueValue) : 0), 0);

  const closedWonValue = all
    .filter((o) => o.stage === "ClosedWon")
    .reduce((s, o) => s + (o.revenueValue ? Number(o.revenueValue) : 0), 0);

  const closingThisQuarter = all
    .filter((o) => o.closeDate && o.closeDate >= quarter.from && o.closeDate <= quarter.to && o.stage !== "ClosedLost" && o.stage !== "ClosedWon")
    .reduce((s, o) => s + (o.revenueValue ? Number(o.revenueValue) : 0), 0);

  const closingThisFiscalYear = all
    .filter((o) => o.closeDate && o.closeDate >= fiscal.from && o.closeDate <= fiscal.to && o.stage !== "ClosedLost")
    .reduce((s, o) => s + (o.revenueValue ? Number(o.revenueValue) : 0), 0);

  const partners = await db.select().from(partnersTable);
  const scores = all.map((o) => (o.meddpiccScore ? Number(o.meddpiccScore) : 0));

  res.json({
    totalPipelineValue,
    totalOpportunities: all.filter((o) => o.type === "opportunity").length,
    totalInitiatives: all.filter((o) => o.type === "initiative").length,
    totalPartners: partners.length,
    closingThisQuarter,
    closingThisFiscalYear,
    closedWonValue,
    avgMeddpiccScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
  });
});

router.get("/dashboard/by-partner", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const partners = await db.select().from(partnersTable);
  const opps = await db.select().from(opportunitiesTable);

  res.json(partners.map((p) => {
    const partnerOpps = opps.filter((o) => o.partnerId === p.id && o.stage !== "ClosedLost");
    return {
      partnerId: p.id,
      partnerName: p.name,
      totalValue: partnerOpps.reduce((s, o) => s + (o.revenueValue ? Number(o.revenueValue) : 0), 0),
      opportunityCount: partnerOpps.filter((o) => o.type === "opportunity").length,
      initiativeCount: partnerOpps.filter((o) => o.type === "initiative").length,
    };
  }));
});

router.get("/dashboard/by-stage", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const stages = ["Qualify", "Discovery", "Propose", "Negotiate", "Commit", "ClosedWon", "ClosedLost"];
  const opps = await db.select().from(opportunitiesTable);

  res.json(stages.map((stage) => {
    const stageOpps = opps.filter((o) => o.stage === stage);
    return {
      stage,
      count: stageOpps.length,
      totalValue: stageOpps.reduce((s, o) => s + (o.revenueValue ? Number(o.revenueValue) : 0), 0),
    };
  }));
});

router.get("/dashboard/health-scores", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const opps = await db.select({
    id: opportunitiesTable.id,
    name: opportunitiesTable.name,
    partnerId: opportunitiesTable.partnerId,
    partnerName: partnersTable.name,
    stage: opportunitiesTable.stage,
    revenueValue: opportunitiesTable.revenueValue,
    meddpiccScore: opportunitiesTable.meddpiccScore,
  }).from(opportunitiesTable)
    .leftJoin(partnersTable, eq(opportunitiesTable.partnerId, partnersTable.id));

  const allEntries = await db.select().from(meddpiccEntriesTable);

  res.json(opps.map((o) => {
    const entries = allEntries.filter((e) => e.opportunityId === o.id);
    const covered = new Set(entries.map((e) => e.element));
    return {
      opportunityId: o.id,
      opportunityName: o.name,
      partnerId: o.partnerId,
      partnerName: o.partnerName ?? "",
      meddpiccScore: o.meddpiccScore ? Number(o.meddpiccScore) : 0,
      missingElements: MEDDPICC_ELEMENTS.filter((el) => !covered.has(el)),
      stage: o.stage,
      revenueValue: o.revenueValue ? Number(o.revenueValue) : null,
    };
  }));
});

export default router;
