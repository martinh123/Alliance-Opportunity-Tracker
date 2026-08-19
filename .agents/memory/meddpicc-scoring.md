---
name: MEDDPICC weighted scoring
description: The MEDDPICC score is weighted and server-owned; the rule for changing it
---

The MEDDPICC qualification score is **weighted** (per-element importance + presence/validation/relevance signals), not a flat "% of elements with an entry".

**Decision:** the scoring math lives in ONE place — the server meddpicc route — and the stored opportunity score is refreshed on every entry mutation. The client never recomputes the overall score; it reads it from the API and only maps a 0-100 value to a presentation band.

**Why:** a single source of truth avoids server/client formula drift; the client stays presentation-only.

**How to apply:** when you change weights or the strength formula, (a) update only the server, (b) run a one-off recalc of existing stored scores (raw pg loop, same pattern as seeding) since stored scores only refresh when an entry changes, and (c) if you add fields to the per-element GET response, update the OpenAPI schema and rerun codegen.
