import { pgTable, text, serial, timestamp, numeric, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Shared structured note shape used by any surface that keeps a list of notes
// the user can add / edit / delete (partners, MEDDPICC sections, etc.).
export interface Note { id: string; text: string; createdAt: string; }

export const partnersTable = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tier: text("tier"),
  region: text("region"),
  // Legacy free-text contact fields — read-only in the UI now; the canonical
  // primary contact is primaryContactId → partner_resources.
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  // FK to partner_resources; declared without .references() to avoid a circular
  // import (partnerResources.ts imports partnersTable). Constraint lives in SQL.
  primaryContactId: integer("primary_contact_id"),
  notes: jsonb("notes").$type<Note[]>().notNull().default([]),
  revenueTarget: numeric("revenue_target", { precision: 15, scale: 2 }),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
