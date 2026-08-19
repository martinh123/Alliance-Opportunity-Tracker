import { Router, type IRouter } from "express";
import { db, meddpiccSectionMetaTable, type Note } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetMeddpiccSectionsParams,
  UpdateMeddpiccSectionParams,
  UpdateMeddpiccSectionBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router: IRouter = Router();

function formatSectionMeta(r: any) {
  return {
    element: r.element,
    notes: Array.isArray(r.notes) ? r.notes : [],
    contactIds: Array.isArray(r.contactIds) ? r.contactIds : [],
    ownerId: r.ownerId ?? null,
  };
}

router.get("/opportunities/:id/meddpicc-sections", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = GetMeddpiccSectionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const rows = await db.select().from(meddpiccSectionMetaTable)
    .where(eq(meddpiccSectionMetaTable.opportunityId, params.data.id));

  res.json(rows.map(formatSectionMeta));
});

router.put("/opportunities/:id/meddpicc-sections/:element", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = UpdateMeddpiccSectionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateMeddpiccSectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Partial update: only touch the fields actually provided so a notes-only save
  // never clobbers existing contactIds (and vice versa). Insert defaults fill a
  // brand-new row.
  const hasNotes = parsed.data.notes !== undefined;
  const hasContacts = Array.isArray(parsed.data.contactIds);
  // ownerId is nullable: an explicit null clears the owner, so distinguish
  // "key present" from "key absent" rather than truthiness.
  const hasOwner = parsed.data.ownerId !== undefined;

  const updateSet: { notes?: Note[]; contactIds?: string[]; ownerId?: string | null } = {};
  if (hasNotes) updateSet.notes = parsed.data.notes;
  if (hasContacts) updateSet.contactIds = parsed.data.contactIds;
  if (hasOwner) updateSet.ownerId = parsed.data.ownerId ?? null;

  if (!hasNotes && !hasContacts && !hasOwner) {
    const [existing] = await db.select().from(meddpiccSectionMetaTable)
      .where(and(
        eq(meddpiccSectionMetaTable.opportunityId, params.data.id),
        eq(meddpiccSectionMetaTable.element, params.data.element),
      ));
    res.json(formatSectionMeta(existing ?? { element: params.data.element, notes: "", contactIds: [], ownerId: null }));
    return;
  }

  const [saved] = await db.insert(meddpiccSectionMetaTable)
    .values({
      opportunityId: params.data.id,
      element: params.data.element,
      notes: hasNotes ? parsed.data.notes! : [],
      contactIds: hasContacts ? parsed.data.contactIds! : [],
      ownerId: hasOwner ? (parsed.data.ownerId ?? null) : null,
    })
    .onConflictDoUpdate({
      target: [meddpiccSectionMetaTable.opportunityId, meddpiccSectionMetaTable.element],
      set: updateSet,
    })
    .returning();

  res.json(formatSectionMeta(saved));
});

export default router;
