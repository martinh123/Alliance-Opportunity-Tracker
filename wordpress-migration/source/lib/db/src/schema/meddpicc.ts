import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { opportunitiesTable } from "./opportunities";

export const meddpiccEntriesTable = pgTable("meddpicc_entries", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),
  element: text("element").notNull(), // metrics|economic_buyer|decision_criteria|decision_process|paper_process|identify_pain|champion|competition
  content: text("content").notNull(),
  customerValidated: boolean("customer_validated").notNull().default(false),
  relevanceScore: integer("relevance_score"), // 1-5
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMeddpiccEntrySchema = createInsertSchema(meddpiccEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMeddpiccEntry = z.infer<typeof insertMeddpiccEntrySchema>;
export type MeddpiccEntry = typeof meddpiccEntriesTable.$inferSelect;
