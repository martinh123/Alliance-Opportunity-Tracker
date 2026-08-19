import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { opportunitiesTable } from "./opportunities";

export interface CompanySource {
  title: string;
  url: string;
}

// AI-synthesized public-company context for a single MEDDPICC element.
// Presentation-only: this NEVER feeds the weighted MEDDPICC score, which is
// driven solely by rep-authored meddpicc_entries.
export interface CompanyResearchSection {
  element: string; // one of the 8 MEDDPICC elements
  summary: string;
  sources: CompanySource[];
}

export const companyResearchTable = pgTable("company_research", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id")
    .notNull()
    .unique()
    .references(() => opportunitiesTable.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  companyDomain: text("company_domain"),
  industry: text("industry"),
  location: text("location"),
  overview: text("overview"),
  sections: jsonb("sections").$type<CompanyResearchSection[]>().default([]).notNull(),
  status: text("status").notNull().default("ready"), // ready | error
  error: text("error"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanyResearchSchema = createInsertSchema(companyResearchTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyResearch = z.infer<typeof insertCompanyResearchSchema>;
export type CompanyResearch = typeof companyResearchTable.$inferSelect;
