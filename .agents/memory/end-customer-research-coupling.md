---
name: End customer ↔ company research coupling
description: Why changing an opportunity's end customer must clear its stored company research.
---

# End customer change clears company research

When an opportunity's `endCustomer` (or `endCustomerDomain`) changes, the stored AI company
research row is for the *old* company and is now wrong. The opportunities PATCH handler
deletes the `companyResearchTable` row for that opportunity whenever either field actually
changes value (compared against the existing row).

**Why:** Company research is presentation-only context keyed per opportunity, generated for a
specific company. Showing it after the end customer changes would display the wrong company's
context. Reps re-run "Generate" to rebuild it. Clearing (not auto-regenerating) also avoids
surprise AI billing on a simple edit.

**How to apply:** Any new path that mutates an opportunity's end customer must keep this
coupling — clear or regenerate research, never leave a stale row. Frontend must invalidate both
the opportunity query and the company-research query after such an edit.
