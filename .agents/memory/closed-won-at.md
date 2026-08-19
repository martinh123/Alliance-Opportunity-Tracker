---
name: closedWonAt auto-timestamp behavior
description: closedWonAt is auto-set server-side on the first ClosedWon stage transition; not cleared when reopened
---

When a PATCH to `/api/opportunities/:id` sets `stage: "ClosedWon"`, the server checks if `closedWonAt` is already set. If not, it sets it to `new Date()`. This means the timestamp records the FIRST time the deal was won and is preserved even if the stage is later changed back.

**Why:** VP-level attainment reports need a stable close date for fiscal period filtering. Clearing it on re-open would corrupt historical FY/Q closed-won totals.

**How to apply:** Dashboard computes FY and Q Closed Won revenue by filtering `stage === "ClosedWon"` rows where `closedWonAt.slice(0, 10)` falls within fiscal period bounds derived from `profile.fiscalYearStart`. The `fiscalPeriodBounds(fyStartMonth)` helper in dashboard.tsx handles the fiscal year calendar math.
