import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, opportunitiesTable, partnersTable, usersTable, companyResearchTable, meddpiccSectionMetaTable, meddpiccEntriesTable } from "@workspace/db";
import type { CompanyResearchSection, CompanySource, OppContact } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ResolveCompanyQueryParams,
  GetCompanyResearchParams,
  RefreshCompanyResearchParams,
  RefreshCompanyResearchSectionParams,
  RefreshCompanyResearchSectionBody,
  SearchPartnerMacroParams,
  SearchPartnerMacroBody,
  SearchOpportunityMacroParams,
  SearchOpportunityMacroBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";
import { resolveCompanies, generateCompanyResearch, generateSectionResearch, generateMacroResearch } from "../lib/companyIntel";
import { formatOpp, withJoins as oppWithJoins } from "./opportunities";

const router: IRouter = Router();

/** Render a macro research result as a plain-text note body with sources. */
function macroNoteText(kind: "partner" | "customer", name: string, summary: string, sources: CompanySource[]): string {
  const heading = kind === "partner" ? `AI Macro Search — ${name}` : `AI Macro Search — ${name} (end customer)`;
  const sourceLines = sources.length > 0
    ? `\n\nSources:\n${sources.map((s) => `• ${s.title} — ${s.url}`).join("\n")}`
    : "";
  return `${heading}\n\n${summary}${sourceLines}`;
}

function formatResearch(r: any) {
  return {
    opportunityId: r.opportunityId,
    companyName: r.companyName,
    companyDomain: r.companyDomain ?? null,
    industry: r.industry ?? null,
    location: r.location ?? null,
    overview: r.overview ?? null,
    sections: Array.isArray(r.sections) ? r.sections : [],
    status: r.status,
    error: r.error ?? null,
    generatedAt: r.generatedAt instanceof Date ? r.generatedAt.toISOString() : (r.generatedAt ?? null),
  };
}

router.get("/companies/resolve", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = ResolveCompanyQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const q = parsed.data.q.trim();
  if (!q) { res.json([]); return; }

  try {
    const candidates = await resolveCompanies(q);
    res.json(candidates);
  } catch (err) {
    req.log.error({ err }, "Company resolution failed");
    res.status(502).json({ error: "Company lookup failed. Please try again." });
  }
});

router.get("/opportunities/:id/company-research", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = GetCompanyResearchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [research] = await db.select().from(companyResearchTable)
    .where(eq(companyResearchTable.opportunityId, params.data.id));

  if (!research) { res.status(404).json({ error: "No research generated yet" }); return; }
  res.json(formatResearch(research));
});

router.post("/opportunities/:id/company-research/refresh", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = RefreshCompanyResearchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [opp] = await db.select({
    id: opportunitiesTable.id,
    endCustomer: opportunitiesTable.endCustomer,
    endCustomerDomain: opportunitiesTable.endCustomerDomain,
  }).from(opportunitiesTable).where(eq(opportunitiesTable.id, params.data.id));

  if (!opp) { res.status(404).json({ error: "Opportunity not found" }); return; }

  const companyName = (opp.endCustomer ?? "").trim();
  if (!companyName) {
    res.status(400).json({ error: "Set an end customer on this opportunity before generating company context." });
    return;
  }

  try {
    const result = await generateCompanyResearch({ name: companyName, domain: opp.endCustomerDomain });
    const now = new Date();
    const values = {
      opportunityId: opp.id,
      companyName,
      companyDomain: opp.endCustomerDomain ?? null,
      industry: null as string | null,
      location: null as string | null,
      overview: result.overview,
      sections: result.sections,
      status: "ready" as const,
      error: null as string | null,
      generatedAt: now,
    };

    const [saved] = await db.insert(companyResearchTable)
      .values(values)
      .onConflictDoUpdate({
        target: companyResearchTable.opportunityId,
        set: {
          companyName: values.companyName,
          companyDomain: values.companyDomain,
          overview: values.overview,
          sections: values.sections,
          status: values.status,
          error: values.error,
          generatedAt: values.generatedAt,
        },
      })
      .returning();

    res.json(formatResearch(saved));
  } catch (err) {
    req.log.error({ err }, "Company research generation failed");
    res.status(502).json({ error: "Could not generate company context. Please try again." });
  }
});

// PARTNER MACRO SEARCH — grounded AI briefing on the GSI partner itself,
// appended to the partner's notes. Presentation-only.
router.post("/partners/:id/macro-research", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = SearchPartnerMacroParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SearchPartnerMacroBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, params.data.id));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  try {
    const result = await generateMacroResearch({ name: partner.name }, "partner", body.data.context ?? null);
    const note = {
      id: randomUUID(),
      text: macroNoteText("partner", partner.name, result.summary, result.sources),
      createdAt: new Date().toISOString(),
    };
    // Re-read notes at write time to minimize clobbering concurrent edits.
    const [current] = await db.select().from(partnersTable).where(eq(partnersTable.id, params.data.id));
    if (!current) { res.status(404).json({ error: "Partner not found" }); return; }
    const notes = [...(Array.isArray(current.notes) ? current.notes : []), note];
    const [updated] = await db.update(partnersTable).set({ notes }).where(eq(partnersTable.id, params.data.id)).returning();

    res.json({
      id: updated.id,
      name: updated.name,
      tier: updated.tier,
      region: updated.region,
      contactName: updated.contactName,
      contactEmail: updated.contactEmail,
      primaryContactId: updated.primaryContactId ?? null,
      notes: Array.isArray(updated.notes) ? updated.notes : [],
      revenueTarget: updated.revenueTarget != null ? Number(updated.revenueTarget) : null,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Partner macro research failed");
    res.status(502).json({ error: "Could not run the partner macro search. Please try again." });
  }
});

// OPPORTUNITY MACRO SEARCH — grounded AI briefing on the end customer,
// appended to the opportunity's notes. Presentation-only.
router.post("/opportunities/:id/macro-research", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = SearchOpportunityMacroParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SearchOpportunityMacroBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [opp] = await db.select().from(opportunitiesTable).where(eq(opportunitiesTable.id, params.data.id));
  if (!opp) { res.status(404).json({ error: "Opportunity not found" }); return; }

  const companyName = (opp.endCustomer ?? "").trim();
  if (!companyName) {
    res.status(400).json({ error: "Set an end customer on this opportunity before running a macro search." });
    return;
  }

  try {
    const result = await generateMacroResearch(
      { name: companyName, domain: opp.endCustomerDomain },
      "customer",
      body.data.context ?? null,
    );
    const note = {
      id: randomUUID(),
      text: macroNoteText("customer", companyName, result.summary, result.sources),
      createdAt: new Date().toISOString(),
    };
    const [current] = await db.select().from(opportunitiesTable).where(eq(opportunitiesTable.id, params.data.id));
    if (!current) { res.status(404).json({ error: "Opportunity not found" }); return; }
    const notes = [...(Array.isArray(current.notes) ? current.notes : []), note];
    await db.update(opportunitiesTable).set({ notes, updatedAt: new Date() }).where(eq(opportunitiesTable.id, params.data.id));

    const [full] = await db.select(oppWithJoins).from(opportunitiesTable)
      .leftJoin(partnersTable, eq(opportunitiesTable.partnerId, partnersTable.id))
      .leftJoin(usersTable, eq(opportunitiesTable.ownerId, usersTable.id))
      .where(eq(opportunitiesTable.id, params.data.id));

    res.json(formatOpp(full));
  } catch (err) {
    req.log.error({ err }, "Opportunity macro research failed");
    res.status(502).json({ error: "Could not run the macro search. Please try again." });
  }
});

router.post("/opportunities/:id/company-research/sections/:element/refresh", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = RefreshCompanyResearchSectionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Optional rep-edited search context that steers the focused research.
  const body = RefreshCompanyResearchSectionBody.safeParse(req.body ?? {});
  const searchContext = body.success ? (body.data.context ?? null) : null;

  const { id, element } = params.data;

  const [opp] = await db.select({
    id: opportunitiesTable.id,
    endCustomer: opportunitiesTable.endCustomer,
    endCustomerDomain: opportunitiesTable.endCustomerDomain,
    contacts: opportunitiesTable.contacts,
  }).from(opportunitiesTable).where(eq(opportunitiesTable.id, id));

  if (!opp) { res.status(404).json({ error: "Opportunity not found" }); return; }

  const companyName = (opp.endCustomer ?? "").trim();
  if (!companyName) {
    res.status(400).json({ error: "Set an end customer on this opportunity before generating company context." });
    return;
  }

  // Load this section's rep-authored focus: notes + associated contact ids.
  const [meta] = await db.select().from(meddpiccSectionMetaTable)
    .where(and(eq(meddpiccSectionMetaTable.opportunityId, id), eq(meddpiccSectionMetaTable.element, element)));

  const contactIds = new Set(Array.isArray(meta?.contactIds) ? meta!.contactIds : []);
  const allContacts: OppContact[] = Array.isArray(opp.contacts) ? opp.contacts : [];
  const focusContacts = allContacts
    .filter((c) => contactIds.has(c.id))
    .map((c) => ({ name: c.name, role: c.role ?? null, org: c.org ?? null }));

  // The contact designated as owner for this element (if any).
  const ownerContact = meta?.ownerId ? allContacts.find((c) => c.id === meta.ownerId) : undefined;
  const owner = ownerContact
    ? { name: ownerContact.name, role: ownerContact.role ?? null, org: ownerContact.org ?? null }
    : null;

  // The rep's qualification entries for this element — used to anchor the search.
  const entryRows = await db.select({ content: meddpiccEntriesTable.content })
    .from(meddpiccEntriesTable)
    .where(and(eq(meddpiccEntriesTable.opportunityId, id), eq(meddpiccEntriesTable.element, element)));
  const entries = entryRows.map((r) => r.content).filter((c): c is string => typeof c === "string" && c.trim().length > 0);

  // Section notes are a list of structured notes; flatten their text for the AI focus.
  const notesText = (Array.isArray(meta?.notes) ? meta!.notes : [])
    .map((n) => (n?.text ?? "").trim())
    .filter(Boolean)
    .join("\n");

  try {
    const section = await generateSectionResearch(
      { name: companyName, domain: opp.endCustomerDomain },
      element,
      { notes: notesText, contacts: focusContacts, owner, entries, searchContext },
    );

    // Merge the refreshed section into the stored research row (replace in place
    // if the element already exists, otherwise append). Presentation-only.
    const [existing] = await db.select().from(companyResearchTable)
      .where(eq(companyResearchTable.opportunityId, id));

    const prevSections: CompanyResearchSection[] = Array.isArray(existing?.sections) ? existing!.sections : [];
    const hasElement = prevSections.some((s) => s.element === element);
    const mergedSections = hasElement
      ? prevSections.map((s) => (s.element === element ? section : s))
      : [...prevSections, section];

    const now = new Date();
    const [saved] = await db.insert(companyResearchTable)
      .values({
        opportunityId: id,
        companyName,
        companyDomain: opp.endCustomerDomain ?? null,
        industry: existing?.industry ?? null,
        location: existing?.location ?? null,
        overview: existing?.overview ?? null,
        sections: mergedSections,
        status: "ready" as const,
        error: null,
        generatedAt: now,
      })
      .onConflictDoUpdate({
        target: companyResearchTable.opportunityId,
        set: {
          companyName,
          companyDomain: opp.endCustomerDomain ?? null,
          sections: mergedSections,
          status: "ready" as const,
          error: null,
          generatedAt: now,
        },
      })
      .returning();

    res.json(formatResearch(saved));
  } catch (err) {
    req.log.error({ err }, "Section company research generation failed");
    res.status(502).json({ error: "Could not generate company context for this section. Please try again." });
  }
});

export default router;
