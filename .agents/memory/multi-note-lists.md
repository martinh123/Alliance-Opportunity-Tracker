---
name: Structured multi-note lists
description: How add/edit/delete note lists are modeled and persisted across surfaces in the GSI tracker
---

# Structured multi-note lists

Notes on partners, opportunities, and MEDDPICC sections are all a shared `Note`
shape `{id,text,createdAt}` stored in a jsonb column, edited via one reusable
controlled `NotesEditor` (partners + sections) or the older `NotesSheet`
(opportunities).

**Why:** user wanted every notes surface to support multiple add/edit/delete
notes, matching the opportunity gold standard.

**How to apply (the non-obvious parts):**
- `NotesEditor` is fully controlled — it derives each next array from its `notes`
  prop and emits the whole array via `onChange`. It never persists on its own.
- Two persistence styles: partner form holds notes in local form state until
  submit; section notes persist immediately per change.
- Immediate-save surfaces MUST keep a local optimistic copy and serialize saves.
  `SectionPanel` uses a `saveChain` promise ref + a `pendingRef` counter, and its
  `useEffect` only adopts the server prop when `pendingRef.current === 0`. Without
  this, rapid add/edit/delete derive from a stale refetch and drop edits (race /
  lost update). `onSaveNotes` therefore returns the mutate promise for chaining.
- Any surface whose notes feed the presentation-only AI (section "additional
  context") must flatten the list to a newline-joined string where the AI helper
  still expects a string — done in `routes/company.ts`, NOT in companyIntel.
- text→jsonb migrations were done via psql ALTER (drizzle push is TTY-blocked):
  wrap existing non-empty text into a single Note, null/empty → `[]`.
