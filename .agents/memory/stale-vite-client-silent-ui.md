---
name: Silent UI failures in dev preview = stale Vite client
description: When dialogs/buttons silently do nothing in the Replit dev preview but code is correct and Playwright passes, suspect a stale Vite HMR client, not a code bug.
---

# Silent UI failures that only the user sees

## Symptom
- User reports a UI interaction (e.g. Radix Dialog "popups") silently does nothing — no overlay, no dim, no console error.
- Other interactions in the same view DO work (e.g. inline grid edits → PATCH succeeds), proving clicks/handlers reach the app.
- The dialog/modal code is structurally correct (standard controlled Radix `open`/`onOpenChange`, plain Button onClick, no DialogTrigger, no role gating).
- Automated Playwright runs against the dev URL PASS — every dialog opens. Cannot reproduce in a clean browser.

## Root cause (most likely)
A stale Vite dev client / HMR state in the user's long-lived browser tab. The user's tab was holding an out-of-date module graph; new/changed handlers never wired up, so clicks were no-ops while older code paths (inline edit) still worked.

## How to confirm / resolve
- Restart the web workflow, then have the user do a FULL fresh load (new session / hard reload) and log in again.
- Verify via the API server request logs: after the fresh session, the previously-"broken" action shows up (e.g. `POST /api/opportunities → 201`). The server log is ground truth — it reveals whether the user's clicks ever reached the backend.

## Debugging shortcut that saved the most time
Correlate wall-clock time with the api-server request log. If the user's "it still fails" tests produce ZERO new server traffic, they aren't hitting this dev server at all (stale tab, wrong URL, page never loaded) — chase the environment, not the code.
