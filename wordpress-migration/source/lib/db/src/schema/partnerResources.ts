import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import type { Note } from "./partners";

// People at a GSI partner organization. Mirrors internal_resources but is
// scoped to a partner. Optional self-referencing managerId builds a reporting
// hierarchy within that partner.
export const partnerResourcesTable = pgTable("partner_resources", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  func: text("function"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  isManager: boolean("is_manager").notNull().default(false),
  managerId: integer("manager_id"),
  notes: jsonb("notes").$type<Note[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerResourceSchema = createInsertSchema(partnerResourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerResource = z.infer<typeof insertPartnerResourceSchema>;
export type PartnerResource = typeof partnerResourcesTable.$inferSelect;
