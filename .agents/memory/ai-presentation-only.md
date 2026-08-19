---
name: AI company context is presentation-only
description: The hard rule that AI corporate intelligence must never influence MEDDPICC scoring.
---

# AI company context never affects the MEDDPICC score

The GSI tracker shows AI-synthesized corporate context per MEDDPICC element
(split-screen on the opportunity detail page, RIGHT column). This is **strictly
presentation-only**.

**Rule:** the weighted MEDDPICC score is computed solely from rep entries
(presence/validation/relevance) server-side in
`artifacts/api-server/src/routes/meddpicc.ts`. Company research lives in a
separate route/store (`company.ts` / `companyIntel.ts`) and must never feed into
the scoring helpers.

**Why:** explicit product requirement — the score must reflect what the rep has
actually qualified, not what a model inferred about the company. Mixing them
would let unvalidated AI text inflate qualification.

**How to apply:** when touching scoring or research code, keep the two data paths
disjoint. Do not import research data into meddpicc scoring, and keep the UI
labeling ("presentation only · not scored") intact.
