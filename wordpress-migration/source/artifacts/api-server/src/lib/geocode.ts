import { db, geocodeCacheTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

const MODEL = "gemini-2.5-flash";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim usage policy: max 1 request/second. All lookups go through a
// serialized queue with this spacing.
const NOMINATIM_SPACING_MS = 1100;
// Negative cache entries ("couldn't place this") are retried after this long,
// so a string that becomes resolvable (or was mis-judged) isn't wrong forever.
const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResolvedPlace {
  canonicalName: string;
  lat: number;
  lon: number;
}

/** Normalize a free-text location into a stable cache key. */
export function normalizeLocationKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

// ── Nominatim (serialized, rate-limited) ─────────────────────────────────────

let nominatimChain: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

function nominatimLookup(query: string): Promise<ResolvedPlace | null> {
  const run = async (): Promise<ResolvedPlace | null> => {
    const wait = lastNominatimAt + NOMINATIM_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    try {
      const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1&accept-language=en`;
      const res = await fetch(url, {
        headers: { "User-Agent": "gsi-partner-tracker/1.0 (contact proximity search)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string; name?: string }>;
      const hit = rows?.[0];
      if (!hit) return null;
      const lat = Number(hit.lat);
      const lon = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { canonicalName: hit.display_name || hit.name || query, lat, lon };
    } catch (err) {
      logger.warn({ err, query }, "nominatim lookup failed");
      return null;
    }
  };
  const p = nominatimChain.then(run, run);
  nominatimChain = p.catch(() => undefined);
  return p;
}

// ── Gemini batch normalization ───────────────────────────────────────────────

interface AiNormalized {
  input: string;
  place: string | null;
  lat: number | null;
  lon: number | null;
}

/** Strip markdown fences and defensively parse Gemini JSON output. */
function parseAiJson(text: string): unknown {
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Escape raw control chars inside string literals (common Gemini quirk).
    let out = "";
    let inString = false;
    let escaped = false;
    for (const ch of stripped) {
      if (inString) {
        if (escaped) { out += ch; escaped = false; continue; }
        if (ch === "\\") { out += ch; escaped = true; continue; }
        if (ch === '"') { inString = false; out += ch; continue; }
        const code = ch.charCodeAt(0);
        if (code < 0x20) { out += "\\n"; continue; }
        out += ch;
        continue;
      }
      if (ch === '"') inString = true;
      out += ch;
    }
    try { return JSON.parse(out); } catch { return null; }
  }
}

/**
 * Normalize a batch of free-text rolodex locations ("Cinci", "Fl", "Miss",
 * "Bangalor") into canonical geocodable place names, with an approximate
 * coordinate estimate as a fallback when the geocoder can't place the
 * canonical name either.
 */
async function aiNormalizeBatch(rawValues: string[]): Promise<Map<string, AiNormalized>> {
  const result = new Map<string, AiNormalized>();
  if (rawValues.length === 0) return result;
  // Only keys we actually asked about may be written — the model's echoed
  // "input" is untrusted content and must never mint new cache keys.
  const requestedKeys = new Set(rawValues.map(normalizeLocationKey));

  const prompt = `You are normalizing location strings from a business contact rolodex (mostly US, Europe, and India based contacts). Each string is supposed to name a place: a city, state/region, or country — but may use abbreviations, informal short forms, or misspellings (e.g. "Fl" = Florida, "Cinci" = Cincinnati Ohio, "Miss" = Mississippi, "Bangalor" = Bangalore).

For each input string, produce:
- "place": the canonical, unambiguous place name suitable for a geocoder, formatted "City, Region, Country" or "Region, Country" or "Country". If the string is not plausibly a place name, use null.
- "lat" and "lon": your best estimate of the place's coordinates (decimal degrees), or null if place is null.

Input strings (JSON array):
${JSON.stringify(rawValues)}

Return ONLY a JSON array (no prose, no markdown fences), same order and length as the input, each element: {"input": "<the input string>", "place": "..." | null, "lat": number | null, "lon": number | null}`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        // Thinking tokens count against maxOutputTokens on gemini-2.5-flash;
        // cap thinking and give the JSON ample room.
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 16384,
      },
    });
    const parsed = parseAiJson(response.text ?? "");
    if (!Array.isArray(parsed)) {
      logger.warn({ count: rawValues.length }, "AI location normalization returned non-array");
      return result;
    }
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i] as Record<string, unknown> | null;
      if (!item || typeof item !== "object") continue;
      // Bind by echoed input only when it maps to a requested key; otherwise
      // fall back to positional correspondence. Never accept foreign keys.
      let key: string | null = null;
      if (typeof item.input === "string" && item.input && requestedKeys.has(normalizeLocationKey(item.input))) {
        key = normalizeLocationKey(item.input);
      } else if (i < rawValues.length) {
        key = normalizeLocationKey(rawValues[i]);
      }
      if (key == null) continue;
      const place = typeof item.place === "string" && item.place.trim() ? item.place.trim() : null;
      const lat = typeof item.lat === "number" && item.lat >= -90 && item.lat <= 90 ? item.lat : null;
      const lon = typeof item.lon === "number" && item.lon >= -180 && item.lon <= 180 ? item.lon : null;
      result.set(key, { input: rawValues[i] ?? key, place, lat, lon });
    }
  } catch (err) {
    logger.warn({ err }, "AI location normalization failed");
  }
  return result;
}

// ── Resolver with cache ──────────────────────────────────────────────────────

async function upsertCache(
  key: string,
  value: { canonicalName: string | null; lat: number | null; lon: number | null; resolved: boolean; source: string | null }
): Promise<void> {
  await db
    .insert(geocodeCacheTable)
    .values({ query: key, ...value })
    .onConflictDoUpdate({
      target: geocodeCacheTable.query,
      set: { ...value, updatedAt: new Date() },
    });
}

/**
 * Resolve free-text location strings to coordinates. Returns a map keyed by
 * normalized location key; a null value means the string could not be placed.
 *
 * Pipeline per uncached string: AI normalization to a canonical place name →
 * Nominatim geocode of that name → AI coordinate estimate as last resort.
 * If AI normalization is unavailable, falls back to geocoding the raw string.
 * Every outcome (including failure) is cached so repeat searches never re-hit
 * the geocoder or the model.
 */
export async function resolveLocations(rawValues: string[]): Promise<Map<string, ResolvedPlace | null>> {
  const out = new Map<string, ResolvedPlace | null>();
  // Distinct normalized keys, remembering one raw representative each.
  const byKey = new Map<string, string>();
  for (const raw of rawValues) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeLocationKey(trimmed);
    if (!byKey.has(key)) byKey.set(key, trimmed);
  }
  if (byKey.size === 0) return out;

  const keys = [...byKey.keys()];
  const cached = await db.select().from(geocodeCacheTable).where(inArray(geocodeCacheTable.query, keys));
  for (const row of cached) {
    if (row.resolved && row.lat != null && row.lon != null) {
      out.set(row.query, { canonicalName: row.canonicalName ?? byKey.get(row.query) ?? row.query, lat: row.lat, lon: row.lon });
    } else if (Date.now() - row.updatedAt.getTime() < NEGATIVE_CACHE_TTL_MS) {
      out.set(row.query, null);
    }
    // Expired negative entries fall through to `missing` and get retried.
  }

  const missing = keys.filter((k) => !out.has(k));
  if (missing.length === 0) return out;

  const aiMap = await aiNormalizeBatch(missing.map((k) => byKey.get(k)!));

  for (const key of missing) {
    const raw = byKey.get(key)!;
    const norm = aiMap.get(key);

    let resolvedPlace: ResolvedPlace | null = null;
    let source: string | null = null;
    // Only definitive outcomes are cached: a successful resolution, or the AI
    // confidently saying the string isn't a place. Transient failures (model
    // unavailable, geocoder timeout/outage) stay uncached so the next search
    // retries instead of durably mis-reporting the location as unplaceable.
    let cacheable = false;

    if (norm && norm.place === null) {
      // AI is confident this isn't a place — negative-cache without geocoding.
      cacheable = true;
    } else if (norm?.place) {
      const geo = await nominatimLookup(norm.place);
      if (geo) {
        // Keep the AI's compact canonical name; Nominatim display names are long.
        resolvedPlace = { canonicalName: norm.place, lat: geo.lat, lon: geo.lon };
        source = "ai+nominatim";
        cacheable = true;
      } else if (norm.lat != null && norm.lon != null) {
        // Geocoder couldn't place the canonical name; fall back to the AI's
        // coordinate estimate (provenance recorded as "ai").
        resolvedPlace = { canonicalName: norm.place, lat: norm.lat, lon: norm.lon };
        source = "ai";
        cacheable = true;
      }
    } else {
      // AI unavailable for this string — try the raw text directly.
      const geo = await nominatimLookup(raw);
      if (geo) {
        resolvedPlace = geo;
        source = "nominatim";
        cacheable = true;
      }
    }

    out.set(key, resolvedPlace);
    if (!cacheable) continue;
    try {
      await upsertCache(key, {
        canonicalName: resolvedPlace?.canonicalName ?? norm?.place ?? null,
        lat: resolvedPlace?.lat ?? null,
        lon: resolvedPlace?.lon ?? null,
        resolved: resolvedPlace != null,
        source,
      });
    } catch (err) {
      logger.warn({ err, key }, "geocode cache upsert failed");
    }
  }

  return out;
}

/** Resolve a single location string (e.g. the search origin). */
export async function resolveLocation(raw: string): Promise<ResolvedPlace | null> {
  const map = await resolveLocations([raw]);
  return map.get(normalizeLocationKey(raw)) ?? null;
}

// ── Distance ─────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two points, in kilometers. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
