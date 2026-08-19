import { pgTable, text, serial, timestamp, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { opportunitiesTable } from "./opportunities";
import type { Note } from "./partners";

// Per-opportunity, per-MEDDPICC-element working area: the rep's free-text notes
// and the contact ids (referencing opportunitiesTable.contacts) they have
// associated with this element. These feed the per-section focused AI refresh,
// which is presentation-only and NEVER affects the weighted MEDDPICC score.
export const meddpiccSectionMetaTable = pgTable(
  "meddpicc_section_meta",
  {
    id: serial("id").primaryKey(),
    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    element: text("element").notNull(), // one of the 8 MEDDPICC elements
    notes: jsonb("notes").$type<Note[]>().notNull().default([]),
    contactIds: jsonb("contact_ids").$type<string[]>().notNull().default([]),
    // The contact (from opportunitiesTable.contacts) designated as the owner /
    // key person for this element. Feeds the focused AI refresh; nullable.
    ownerId: text("owner_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    uniqueOppElement: unique("meddpicc_section_meta_opp_element").on(t.opportunityId, t.element),
  }),
);

export const insertMeddpiccSectionMetaSchema = createInsertSchema(meddpiccSectionMetaTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMeddpiccSectionMeta = z.infer<typeof insertMeddpiccSectionMetaSchema>;
export type MeddpiccSectionMeta = typeof meddpiccSectionMetaTable.$inferSelect;
