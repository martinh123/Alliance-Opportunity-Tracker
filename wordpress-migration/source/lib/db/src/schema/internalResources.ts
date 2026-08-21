import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface InternalResourceNote {
  id: string;
  text: string;
  createdAt: string;
}

// Internal people resources for the rep's own company (not partner contacts).
// Optional self-referencing managerId builds a reporting hierarchy.
export const internalResourcesTable = pgTable("internal_resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  func: text("function"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  isManager: boolean("is_manager").notNull().default(false),
  managerId: integer("manager_id"),
  notes: jsonb("notes").$type<InternalResourceNote[]>().notNull().default([]),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInternalResourceSchema = createInsertSchema(internalResourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInternalResource = z.infer<typeof insertInternalResourceSchema>;
export type InternalResource = typeof internalResourcesTable.$inferSelect;
