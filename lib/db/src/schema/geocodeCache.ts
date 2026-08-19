import { pgTable, text, serial, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";

// Server-side geocoding cache for free-text contact locations ("NYC", "NJ",
// "Cinci", "West Bengal"). One row per normalized query string; resolved=false
// rows are negative-cache entries so unresolvable strings don't re-hit the
// geocoder on every search.
export const geocodeCacheTable = pgTable("geocode_cache", {
  id: serial("id").primaryKey(),
  query: text("query").notNull().unique(), // normalized: trimmed, collapsed whitespace, lowercased
  canonicalName: text("canonical_name"),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  resolved: boolean("resolved").notNull().default(false),
  source: text("source"), // "nominatim" | "ai+nominatim" | "ai"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type GeocodeCacheRow = typeof geocodeCacheTable.$inferSelect;
