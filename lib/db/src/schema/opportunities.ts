import { pgTable, text, serial, timestamp, integer, numeric, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { usersTable } from "./users";

export interface OppNote { id: string; text: string; createdAt: string; }
export interface OppContact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  location?: string | null;
  org: string; // "HPE" | "Partner" | "Customer" | "Other"
  // Link to the people directory: "internal:<id>" | "partner:<id>"
  directoryRef?: string | null;
  createdAt: string;
}

export const opportunitiesTable = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("opportunity"), // opportunity | initiative
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  stage: text("stage").notNull().default("Qualify"), // Qualify|Discovery|Propose|Negotiate|Commit|ClosedWon|ClosedLost|Dormant
  // Excel fields
  country: text("country"),
  dateIn: date("date_in", { mode: "string" }),
  hpeTeam: text("hpe_team"),
  partnerContact: text("partner_contact"),
  partnerContactRole: text("partner_contact_role"),
  numEndpoints: integer("num_endpoints"),
  useCase: text("use_case"),
  // Legacy/additional fields
  endCustomer: text("end_customer"),
  // Canonical end-customer company identity (selected via company picker at creation).
  // Presentation-only — does NOT affect the weighted MEDDPICC score.
  endCustomerDomain: text("end_customer_domain"),
  revenueValue: numeric("revenue_value", { precision: 15, scale: 2 }),
  closeDate: date("close_date", { mode: "string" }),
  description: text("description"),
  notes: jsonb("notes").$type<OppNote[]>().default([]).notNull(),
  contacts: jsonb("contacts").$type<OppContact[]>().default([]).notNull(),
  meddpiccScore: numeric("meddpicc_score", { precision: 5, scale: 2 }),
  closedWonAt: timestamp("closed_won_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOpportunitySchema = createInsertSchema(opportunitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
