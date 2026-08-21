import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const profilesTable = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  revenueMetric: text("revenue_metric").notNull().default("ACV"), // ACV | TCV | ARR | Bookings
  fiscalYearStart: text("fiscal_year_start").notNull().default("1"), // month 1-12
  fiscalYearEnd: text("fiscal_year_end").notNull().default("12"),
  quota: numeric("quota", { precision: 15, scale: 2 }),
  q1GoalPct: numeric("q1_goal_pct", { precision: 5, scale: 2 }).default("25"),
  q2GoalPct: numeric("q2_goal_pct", { precision: 5, scale: 2 }).default("25"),
  q3GoalPct: numeric("q3_goal_pct", { precision: 5, scale: 2 }).default("25"),
  q4GoalPct: numeric("q4_goal_pct", { precision: 5, scale: 2 }).default("25"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
