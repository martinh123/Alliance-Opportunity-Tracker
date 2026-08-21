import { Router } from "express";
import { db, internalResourcesTable, partnerResourcesTable, partnersTable, opportunitiesTable } from "@workspace/db";
import { SearchPeopleQueryParams, FindNearbyPeopleQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";
import { resolveLocations, normalizeLocationKey, haversineKm } from "../lib/geocode";

const router = Router();

type PersonResult = {
  ref: string;
  source: "internal" | "partner" | "contact";
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  org: string | null;
  partnerId: number | null;
};

/**
 * Unified typeahead search across the three people directories:
 * internal_resources, partner_resources, and opportunity jsonb contacts.
 * Simple case-insensitive substring match on name/role/email, done in-process
 * (dataset is small — a single team's rolodex).
 */
router.get("/people/search", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const query = SearchPeopleQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { q = "", partnerId, scope = "all", limit = 10 } = query.data;
  const needle = q.trim().toLowerCase();
  const cap = Math.max(1, Math.min(limit, 25));

  // Empty query = browse mode: everything in scope, alphabetical.
  const matches = (...fields: (string | null | undefined)[]) =>
    !needle || fields.some((f) => (f ?? "").toLowerCase().includes(needle));

  const results: PersonResult[] = [];

  if (scope === "all" || scope === "internal") {
    const rows = await db.select().from(internalResourcesTable);
    for (const r of rows) {
      if (!matches(r.name, r.func, r.email, r.location)) continue;
      results.push({ ref: `internal:${r.id}`, source: "internal", name: r.name, role: r.func, email: r.email, phone: r.phone, location: r.location, org: "Internal", partnerId: null });
    }
  }

  if (scope === "all" || scope === "partner") {
    const [rows, partners] = await Promise.all([
      db.select().from(partnerResourcesTable),
      db.select({ id: partnersTable.id, name: partnersTable.name }).from(partnersTable),
    ]);
    const partnerName = new Map(partners.map((p) => [p.id, p.name]));
    for (const r of rows) {
      // Hard scope: a partnerId restricts partner-directory hits to that partner.
      if (partnerId != null && r.partnerId !== partnerId) continue;
      if (!matches(r.name, r.func, r.email, r.location)) continue;
      results.push({ ref: `partner:${r.id}`, source: "partner", name: r.name, role: r.func, email: r.email, phone: r.phone, location: r.location, org: partnerName.get(r.partnerId) ?? "Partner", partnerId: r.partnerId });
    }
  }

  if (scope === "all" || scope === "contact") {
    const opps = await db.select({ id: opportunitiesTable.id, partnerId: opportunitiesTable.partnerId, contacts: opportunitiesTable.contacts }).from(opportunitiesTable);
    // Suppress contacts that mirror a directory record already in the results
    // (e.g. partner resources seeded from opportunity contacts).
    const seen = new Set<string>(
      results.map((r) => `${r.name.toLowerCase()}|${(r.email ?? "").toLowerCase()}`)
    );
    for (const o of opps) {
      // Same hard scope for contacts: only those on this partner's opportunities.
      if (partnerId != null && o.partnerId !== partnerId) continue;
      for (const c of (Array.isArray(o.contacts) ? o.contacts : []) as any[]) {
        if (!c?.name || !matches(c.name, c.role, c.email, c.location)) continue;
        // Dedupe identical people appearing on multiple opportunities.
        const key = `${(c.name ?? "").toLowerCase()}|${(c.email ?? "").toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ref: `contact:${c.id}`, source: "contact", name: c.name, role: c.role ?? null, email: c.email ?? null, phone: c.phone ?? null, location: c.location ?? null, org: c.org ?? null, partnerId: o.partnerId });
      }
    }
  }

  // Rank: name-prefix matches first, then partner-scoped matches, then alphabetical.
  results.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
    const bPrefix = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    if (partnerId != null) {
      const aScoped = a.partnerId === partnerId ? 0 : 1;
      const bScoped = b.partnerId === partnerId ? 0 : 1;
      if (aScoped !== bScoped) return aScoped - bScoped;
    }
    return a.name.localeCompare(b.name);
  });

  res.json(results.slice(0, cap));
});

/**
 * Collect every person across the three directories, deduplicated the same
 * way search dedupes (opportunity contacts that mirror a directory record by
 * name+email are suppressed, as are identical contacts on multiple opps).
 */
async function collectAllPeople(): Promise<PersonResult[]> {
  const [internals, partnerRows, partners, opps] = await Promise.all([
    db.select().from(internalResourcesTable),
    db.select().from(partnerResourcesTable),
    db.select({ id: partnersTable.id, name: partnersTable.name }).from(partnersTable),
    db.select({ id: opportunitiesTable.id, partnerId: opportunitiesTable.partnerId, contacts: opportunitiesTable.contacts }).from(opportunitiesTable),
  ]);
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const results: PersonResult[] = [];

  for (const r of internals) {
    results.push({ ref: `internal:${r.id}`, source: "internal", name: r.name, role: r.func, email: r.email, phone: r.phone, location: r.location, org: "Internal", partnerId: null });
  }
  for (const r of partnerRows) {
    results.push({ ref: `partner:${r.id}`, source: "partner", name: r.name, role: r.func, email: r.email, phone: r.phone, location: r.location, org: partnerName.get(r.partnerId) ?? "Partner", partnerId: r.partnerId });
  }
  const seen = new Set<string>(results.map((r) => `${r.name.toLowerCase()}|${(r.email ?? "").toLowerCase()}`));
  for (const o of opps) {
    for (const c of (Array.isArray(o.contacts) ? o.contacts : []) as any[]) {
      if (!c?.name) continue;
      const key = `${(c.name ?? "").toLowerCase()}|${(c.email ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ ref: `contact:${c.id}`, source: "contact", name: c.name, role: c.role ?? null, email: c.email ?? null, phone: c.phone ?? null, location: c.location ?? null, org: c.org ?? null, partnerId: o.partnerId });
    }
  }
  return results;
}

const KM_PER_MILE = 1.609344;

/**
 * Proximity search: resolve the origin and every distinct contact location to
 * coordinates (cached geocoding), then return everyone within the radius,
 * nearest-first. Contacts without a location are excluded; contacts whose
 * location can't be placed are reported in `unresolved` instead of dropped
 * silently. First-ever search may be slow while the location cache warms up.
 */
router.get("/people/nearby", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const query = FindNearbyPeopleQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { origin, radius, unit = "mi" } = query.data;
  const originText = origin.trim();
  if (!originText) { res.status(400).json({ error: "origin is required" }); return; }
  if (!Number.isFinite(radius) || radius <= 0) { res.status(400).json({ error: "radius must be a positive number" }); return; }
  const radiusKm = Math.min(radius * (unit === "km" ? 1 : KM_PER_MILE), 40000);

  const people = await collectAllPeople();
  const located = people.filter((p) => (p.location ?? "").trim() !== "");

  const resolved = await resolveLocations([originText, ...located.map((p) => p.location!)]);
  const originPlace = resolved.get(normalizeLocationKey(originText));
  if (!originPlace) {
    res.status(422).json({ error: `Couldn't find a place matching "${originText}". Try a city name like "New York" or "London".` });
    return;
  }

  const results: any[] = [];
  // Unresolved locations, keyed by normalized string; keep first-seen casing.
  const unresolvedMap = new Map<string, { location: string; count: number }>();

  for (const p of located) {
    const key = normalizeLocationKey(p.location!);
    const place = resolved.get(key);
    if (!place) {
      const entry = unresolvedMap.get(key);
      if (entry) entry.count += 1;
      else unresolvedMap.set(key, { location: p.location!.trim(), count: 1 });
      continue;
    }
    const km = haversineKm(originPlace.lat, originPlace.lon, place.lat, place.lon);
    if (km > radiusKm) continue;
    const dist = unit === "km" ? km : km / KM_PER_MILE;
    results.push({ ...p, distance: Math.round(dist * 10) / 10, resolvedLocation: place.canonicalName });
  }

  results.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));

  res.json({
    origin: { query: originText, name: originPlace.canonicalName, lat: originPlace.lat, lon: originPlace.lon },
    unit,
    results,
    unresolved: [...unresolvedMap.values()].sort((a, b) => b.count - a.count || a.location.localeCompare(b.location)),
  });
});

export default router;
