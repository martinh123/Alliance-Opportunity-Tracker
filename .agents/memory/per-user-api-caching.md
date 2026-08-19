---
name: Per-user API caching / 304 reverts
description: Why authenticated per-user API responses must be sent no-store, and the matching frontend pitfall
---

**Rule:** Authenticated, per-user API endpoints (e.g. `/api/profile`, `/api/auth/me`) must not be HTTP-cached or ETag-revalidated by the browser. The API disables Express ETags (`app.disable("etag")`) and sends `Cache-Control: no-store` on all `/api` responses. Any new authenticated GET inherits this; do not re-enable ETags for authenticated routes.

**Why:** The same URL returns different data per logged-in user. Express enables ETags by default, producing `304 Not Modified` responses; the browser then serves a cached body. For per-user data this surfaces as settings that appear to "revert" (the Profile fiscal-year-start month snapping back to January after re-login) while the database value is actually correct. A curl round-trip proving DB persistence worked, while the UI showed stale values and logs showed repeated `304` on `/api/profile`, confirmed the cause.

**Companion rule (frontend):** A settings/profile form backed by a query should re-sync local state from the *server primitive values* (e.g. `useEffect(..., [profile?.fiscalYearStart, profile?.quota, ...])`), NOT from the `profile` object reference and NOT via a one-time `useRef` guard. Keying on primitives means an identical background refetch is a no-op (won't clobber edits) while genuine changes — including the undefined→value transition on every remount — repopulate correctly. A one-time guard fails to repopulate on remount (navigate away and back), leaving controlled inputs unhydrated. `refetchOnWindowFocus: false` is also set in QueryClient defaults as a second layer.

**How to apply:** Rely on the global `no-store` middleware in `app.ts` for new authed endpoints. For query-backed settings forms, re-sync on primitive server deps; treat user edits as source of truth between saves.
