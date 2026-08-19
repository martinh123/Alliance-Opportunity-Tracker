import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgExportBundle {
  version: "2";
  exportedAt: string;
  org: { id: number; name: string };
  data: {
    users: any[];
    partners: any[];
    partnerResources: any[];
    internalResources: any[];
    opportunities: any[];
    meddpiccEntries: any[];
    meddpiccSectionMeta: any[];
    companyResearch: any[];
    reminders: any[];
    profiles: any[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Scalar coercion for INSERT parameters.
 * Arrays and objects are passed through unchanged — the pg driver serialises
 * them correctly for jsonb columns. Only Dates need explicit conversion.
 */
function coerce(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  // Strings that look like JSON objects/arrays (from older DB rows or manual
  // exports) should be parsed back to native values before handing to pg.
  if (typeof v === "string") {
    const trimmed = v.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return JSON.parse(v); } catch { /* not JSON — pass as-is */ }
    }
  }
  return v;
}

/**
 * Derive the admin's orgId from their userId.
 * Returns null if the user has no org — the caller must reject the request.
 * Never falls back to a default org to avoid cross-tenant data exposure.
 */
async function getOrgId(adminUserId: number): Promise<number | null> {
  const { rows } = await pool.query<{ org_id: number | null }>(
    "SELECT org_id FROM users WHERE id = $1",
    [adminUserId],
  );
  return rows[0]?.org_id ?? null;
}

// ─── Export ───────────────────────────────────────────────────────────────────

router.get("/admin/org-export", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const orgId = await getOrgId(admin.id);
  if (!orgId) {
    res.status(400).json({ error: "Your account is not assigned to an organisation. Contact a system administrator." });
    return;
  }

  const { rows: orgRows } = await pool.query<{ id: number; name: string }>(
    "SELECT id, name FROM organizations WHERE id = $1",
    [orgId],
  );
  if (!orgRows[0]) {
    res.status(400).json({ error: "Organisation not found. Contact a system administrator." });
    return;
  }
  const org = orgRows[0];

  // Walk the FK graph
  const { rows: users } = await pool.query(
    "SELECT * FROM users WHERE org_id = $1 ORDER BY id",
    [orgId],
  );
  const userIds = users.map((u) => u.id as number);

  const { rows: partners } = await pool.query(
    "SELECT * FROM partners WHERE org_id = $1 ORDER BY id",
    [orgId],
  );
  const partnerIds = partners.map((p) => p.id as number);

  const { rows: partnerResources } = partnerIds.length
    ? await pool.query(
        "SELECT * FROM partner_resources WHERE partner_id = ANY($1) ORDER BY id",
        [partnerIds],
      )
    : { rows: [] };

  const { rows: internalResources } = await pool.query(
    "SELECT * FROM internal_resources WHERE org_id = $1 ORDER BY id",
    [orgId],
  );

  const { rows: opportunities } = userIds.length || partnerIds.length
    ? await pool.query(
        `SELECT * FROM opportunities
         WHERE (owner_id = ANY($1) OR partner_id = ANY($2))
         ORDER BY id`,
        [userIds.length ? userIds : [-1], partnerIds.length ? partnerIds : [-1]],
      )
    : { rows: [] };
  const oppIds = opportunities.map((o) => o.id as number);

  const { rows: meddpiccEntries } = oppIds.length
    ? await pool.query("SELECT * FROM meddpicc_entries WHERE opportunity_id = ANY($1) ORDER BY id", [oppIds])
    : { rows: [] };

  const { rows: meddpiccSectionMeta } = oppIds.length
    ? await pool.query("SELECT * FROM meddpicc_section_meta WHERE opportunity_id = ANY($1) ORDER BY id", [oppIds])
    : { rows: [] };

  const { rows: companyResearch } = oppIds.length
    ? await pool.query("SELECT * FROM company_research WHERE opportunity_id = ANY($1) ORDER BY id", [oppIds])
    : { rows: [] };

  const { rows: reminders } = userIds.length
    ? await pool.query("SELECT * FROM reminders WHERE user_id = ANY($1) ORDER BY id", [userIds])
    : { rows: [] };

  const { rows: profiles } = userIds.length
    ? await pool.query("SELECT * FROM profiles WHERE user_id = ANY($1) ORDER BY id", [userIds])
    : { rows: [] };

  const bundle: OrgExportBundle = {
    version: "2",
    exportedAt: new Date().toISOString(),
    org,
    data: {
      users,
      partners,
      partnerResources,
      internalResources,
      opportunities,
      meddpiccEntries,
      meddpiccSectionMeta,
      companyResearch,
      reminders,
      profiles,
    },
  };

  res.json(bundle);
});

// ─── Import ───────────────────────────────────────────────────────────────────

router.post("/admin/org-import", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const dryRun = req.query.dryRun === "true";
  const body = req.body as OrgExportBundle;

  if (!body || body.version !== "2" || !body.data || typeof body.data !== "object") {
    res.status(400).json({ error: "Invalid org export bundle. Expected version 2 format." });
    return;
  }

  const targetOrgId = await getOrgId(admin.id);
  if (!targetOrgId) {
    res.status(400).json({ error: "Your account is not assigned to an organisation. Contact a system administrator." });
    return;
  }

  // Verify the target org exists before writing anything
  const { rows: orgCheck } = await pool.query("SELECT id FROM organizations WHERE id = $1", [targetOrgId]);
  if (!orgCheck[0]) {
    res.status(400).json({ error: "Organisation not found. Contact a system administrator." });
    return;
  }
  const d = body.data;

  const counts: Record<string, number> = {
    users: 0, partners: 0, partnerResources: 0, internalResources: 0,
    opportunities: 0, meddpiccEntries: 0, meddpiccSectionMeta: 0,
    companyResearch: 0, reminders: 0, profiles: 0,
  };

  // Count what will be imported (for both dry-run preview and real run)
  // Dry-run: return counts only, no inserts.
  const usersToImport = Array.isArray(d.users) ? d.users : [];
  const partnersToImport = Array.isArray(d.partners) ? d.partners : [];
  const partnerResourcesToImport = Array.isArray(d.partnerResources) ? d.partnerResources : [];
  const internalResourcesToImport = Array.isArray(d.internalResources) ? d.internalResources : [];
  const opportunitiesToImport = Array.isArray(d.opportunities) ? d.opportunities : [];
  const meddpiccEntriesToImport = Array.isArray(d.meddpiccEntries) ? d.meddpiccEntries : [];
  const meddpiccSectionMetaToImport = Array.isArray(d.meddpiccSectionMeta) ? d.meddpiccSectionMeta : [];
  const companyResearchToImport = Array.isArray(d.companyResearch) ? d.companyResearch : [];
  const remindersToImport = Array.isArray(d.reminders) ? d.reminders : [];
  const profilesToImport = Array.isArray(d.profiles) ? d.profiles : [];

  if (dryRun) {
    res.json({
      dryRun: true,
      preview: {
        users: usersToImport.length,
        partners: partnersToImport.length,
        partnerResources: partnerResourcesToImport.length,
        internalResources: internalResourcesToImport.length,
        opportunities: opportunitiesToImport.length,
        meddpiccEntries: meddpiccEntriesToImport.length,
        meddpiccSectionMeta: meddpiccSectionMetaToImport.length,
        companyResearch: companyResearchToImport.length,
        reminders: remindersToImport.length,
        profiles: profilesToImport.length,
      },
      warnings: usersToImport.length === 0
        ? ["No users found in the export file."]
        : [],
    });
    return;
  }

  // Real import — additive, re-mapping all IDs to avoid collisions.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // old id → new id maps for each entity type
    const userMap = new Map<number, number>();
    const partnerMap = new Map<number, number>();
    const partnerResourceMap = new Map<number, number>();
    const internalResourceMap = new Map<number, number>();
    const opportunityMap = new Map<number, number>();

    // 1. Users — reuse only if the existing account belongs to the SAME target org.
    // If the email exists in another org, insert a new account in targetOrgId.
    // Never map imported data to a user outside targetOrgId.
    for (const u of usersToImport) {
      const { rows: existing } = await client.query(
        "SELECT id, org_id FROM users WHERE lower(email) = lower($1)",
        [u.email],
      );
      const sameOrgMatch = existing.find((r: any) => r.org_id === targetOrgId);
      if (sameOrgMatch) {
        // Same email, same org — safe to reuse
        userMap.set(u.id, sameOrgMatch.id);
      } else {
        // Either new email, or email exists in a different org — insert fresh
        const insertEmail = existing.length > 0
          ? `${u.email.toLowerCase().split("@")[0]}+import_${targetOrgId}@${u.email.split("@")[1] ?? "imported"}`
          : u.email;
        const { rows } = await client.query(
          `INSERT INTO users (email, password_hash, name, role, quota, region, org_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [insertEmail, u.password_hash, u.name, u.role ?? "rep",
           coerce(u.quota), coerce(u.region), targetOrgId],
        );
        userMap.set(u.id, rows[0].id);
        counts.users++;
      }
    }

    // 2. Partners — insert with target orgId
    for (const p of partnersToImport) {
      const { rows } = await client.query(
        `INSERT INTO partners (name, tier, region, contact_name, contact_email, notes, revenue_target, org_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [p.name, coerce(p.tier), coerce(p.region), coerce(p.contact_name),
         coerce(p.contact_email), coerce(p.notes) ?? "[]", coerce(p.revenue_target), targetOrgId],
      );
      partnerMap.set(p.id, rows[0].id);
      counts.partners++;
    }

    // 3. Partner resources — remap partnerId
    for (const pr of partnerResourcesToImport) {
      const newPartnerId = partnerMap.get(pr.partner_id);
      if (!newPartnerId) continue; // orphaned — skip
      const { rows } = await client.query(
        `INSERT INTO partner_resources (partner_id, name, func, email, phone, location, is_manager, manager_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [newPartnerId, pr.name, coerce(pr.func), coerce(pr.email), coerce(pr.phone), coerce(pr.location),
         pr.is_manager ?? false, null, coerce(pr.notes) ?? "[]"],
      );
      partnerResourceMap.set(pr.id, rows[0].id);
      counts.partnerResources++;
    }

    // 4. Internal resources
    for (const ir of internalResourcesToImport) {
      const { rows } = await client.query(
        `INSERT INTO internal_resources (name, func, email, phone, location, is_manager, manager_id, notes, org_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [ir.name, coerce(ir.func), coerce(ir.email), coerce(ir.phone), coerce(ir.location),
         ir.is_manager ?? false, null, coerce(ir.notes) ?? "[]", targetOrgId],
      );
      internalResourceMap.set(ir.id, rows[0].id);
      counts.internalResources++;
    }

    // 5. Opportunities — remap ownerId + partnerId
    for (const o of opportunitiesToImport) {
      const newOwnerId = userMap.get(o.owner_id);
      const newPartnerId = partnerMap.get(o.partner_id);
      if (!newOwnerId || !newPartnerId) continue; // can't link — skip
      const { rows } = await client.query(
        `INSERT INTO opportunities
           (name, type, partner_id, owner_id, stage, country, date_in, hpe_team,
            partner_contact, partner_contact_role, num_endpoints, use_case,
            end_customer, end_customer_domain, revenue_value, close_date,
            description, notes, contacts, meddpicc_score, closed_won_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING id`,
        [
          o.name, o.type ?? "opportunity", newPartnerId, newOwnerId,
          o.stage ?? "Qualify", coerce(o.country), coerce(o.date_in), coerce(o.hpe_team),
          coerce(o.partner_contact), coerce(o.partner_contact_role), coerce(o.num_endpoints),
          coerce(o.use_case), coerce(o.end_customer), coerce(o.end_customer_domain),
          coerce(o.revenue_value), coerce(o.close_date), coerce(o.description),
          coerce(o.notes) ?? [], coerce(o.contacts) ?? [],
          coerce(o.meddpicc_score), coerce(o.closed_won_at),
        ],
      );
      opportunityMap.set(o.id, rows[0].id);
      counts.opportunities++;
    }

    // 6. MEDDPICC entries — remap opportunityId
    for (const me of meddpiccEntriesToImport) {
      const newOppId = opportunityMap.get(me.opportunity_id);
      if (!newOppId) continue;
      await client.query(
        `INSERT INTO meddpicc_entries (opportunity_id, element, content, customer_validated, relevance_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [newOppId, me.element, coerce(me.content), me.customer_validated ?? false,
         me.relevance_score ?? 3],
      );
      counts.meddpiccEntries++;
    }

    // 7. MEDDPICC section meta — remap opportunityId
    for (const sm of meddpiccSectionMetaToImport) {
      const newOppId = opportunityMap.get(sm.opportunity_id);
      if (!newOppId) continue;
      await client.query(
        `INSERT INTO meddpicc_section_meta (opportunity_id, element, notes, contact_ids, owner_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [newOppId, sm.element, coerce(sm.notes) ?? [],
         coerce(sm.contact_ids) ?? [], coerce(sm.owner_id)],
      );
      counts.meddpiccSectionMeta++;
    }

    // 8. Company research — remap opportunityId
    for (const cr of companyResearchToImport) {
      const newOppId = opportunityMap.get(cr.opportunity_id);
      if (!newOppId) continue;
      await client.query(
        `INSERT INTO company_research
           (opportunity_id, company_name, company_domain, industry, location,
            overview, sections, status, error, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          newOppId, coerce(cr.company_name), coerce(cr.company_domain),
          coerce(cr.industry), coerce(cr.location), coerce(cr.overview),
          coerce(cr.sections) ?? [], cr.status ?? "pending",
          coerce(cr.error), coerce(cr.generated_at),
        ],
      );
      counts.companyResearch++;
    }

    // 9. Reminders — remap userId
    for (const r of remindersToImport) {
      const newUserId = userMap.get(r.user_id);
      if (!newUserId) continue;
      await client.query(
        `INSERT INTO reminders (user_id, name, due_at, entity_type, entity_id, entity_label, notes, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newUserId, r.name, r.due_at,
          coerce(r.entity_type), coerce(r.entity_id), coerce(r.entity_label),
          coerce(r.notes), coerce(r.completed_at),
        ],
      );
      counts.reminders++;
    }

    // 10. Profiles — remap userId (skip if profile already exists for that user)
    for (const p of profilesToImport) {
      const newUserId = userMap.get(p.user_id);
      if (!newUserId) continue;
      const { rows: existing } = await client.query(
        "SELECT id FROM profiles WHERE user_id = $1",
        [newUserId],
      );
      if (existing.length > 0) continue; // profile already exists — don't overwrite
      await client.query(
        `INSERT INTO profiles (user_id, revenue_metric, fiscal_year_start, fiscal_year_end,
           quota, q1_goal_pct, q2_goal_pct, q3_goal_pct, q4_goal_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newUserId,
          coerce(p.revenue_metric) ?? "ACV", coerce(p.fiscal_year_start) ?? "1",
          coerce(p.fiscal_year_end) ?? "12", coerce(p.quota),
          coerce(p.q1_goal_pct) ?? "25", coerce(p.q2_goal_pct) ?? "25",
          coerce(p.q3_goal_pct) ?? "25", coerce(p.q4_goal_pct) ?? "25",
        ],
      );
      counts.profiles++;
    }

    await client.query("COMMIT");
    req.log.info({ counts }, "Org import completed");
    res.json({ ok: true, message: "Data imported successfully.", counts });
  } catch (err: any) {
    await client.query("ROLLBACK");
    req.log.error({ err }, "Org import failed");
    res.status(400).json({ error: `Import failed: ${err?.message ?? "Unknown error"}` });
  } finally {
    client.release();
  }
});

export default router;
