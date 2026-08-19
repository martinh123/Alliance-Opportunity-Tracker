---
name: Geocoding free-text contact locations
description: How the nearby-contacts geocoding pipeline works and the pitfalls that shaped it
---

# Geocoding free-text rolodex locations

**Rule:** never geocode informal contact-location strings raw. Nominatim happily returns a confident wrong hit ("Cinci" → a hamlet in Latvia). Pipeline is: Gemini batch-normalizes strings to canonical "City, Region, Country" names first, then Nominatim geocodes the canonical name; the AI's coordinate estimate is a last resort (provenance `source="ai"`).
**Why:** observed mislocation on real data during the nearby-contacts build.

**Rule:** only cache definitive geocode outcomes. Successful resolutions and AI-confident "not a place" verdicts are cached; transient failures (model down, geocoder timeout) are NOT cached, and negative entries expire after 7 days so mis-judgments aren't wrong forever.
**Why:** a permanently cached transient failure durably mis-reports a contact as unplaceable (code-review finding).

**Rule:** when an AI batch call echoes back inputs, bind results only to the keys you actually requested (validate the echoed input, else use positional order). Untrusted echoed strings must never mint cache keys — that's a cache-poisoning vector.

**How to apply:** all of this lives in the api-server geocode lib (cache table `geocode_cache`). Nominatim is throttled to ~1 req/s via a serialized in-process queue (their usage policy); a cold search over ~40 distinct locations takes ~60s, then everything is cache-hits. Tenant/org scoping of the people directories is intentionally NOT done there — it matches `/people/search` and is covered by the org-scoping project task.
