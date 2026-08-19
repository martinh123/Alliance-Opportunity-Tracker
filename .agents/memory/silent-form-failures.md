---
name: Silent form-submit failures
description: Why a dialog "save" can produce zero network traffic and no console error, and the guardrails now in place.
---

Rule: every dialog form that saves via `mutateAsync` must (1) use `noValidate` + explicit field validation with a destructive toast, and (2) wrap the mutation in try/catch with an error toast. Client-generated ids must use `makeId()` from `src/lib/uid.ts`, never `crypto.randomUUID()` directly.

**Why:** A user "saved" an internal contact and it never appeared — server logs showed no POST at all. Native `<input type="email">` constraint validation blocks submit *before* the handler runs (tooltip easy to miss inside a dialog), and unhandled `mutateAsync` rejections leave the dialog open with zero feedback. `crypto.randomUUID` also throws in non-secure contexts, silently breaking note-add flows.

**How to apply:** When adding any new form/dialog in gsi-tracker, copy the pattern in `internal-resources.tsx`/`partner-resources.tsx` handleSubmit (name required check, email regex check, try/catch + toast, close dialog only on success). When debugging "saved but nothing happened" reports, first check server logs for the write request — absence means a pre-submit client block, not a server issue.
