---
name: Radix Select fires onValueChange("") on remount
description: Controlled shadcn/Radix Select can clobber state with an empty string when its value changes right after (re)mount
---

**Symptom:** A controlled shadcn/Radix `Select` renders blank (no selected item) after navigating away and back, even though the backing server data and the React state's intended value are correct. Direct user interaction works; the breakage only happens on remount/programmatic value change. Other selects on the same page whose default already equals the server value are unaffected.

**Root cause:** When a controlled `<Select value={x} onValueChange={set}>` has its `value` prop change programmatically right after (re)mount (e.g. an effect hydrates `"1"` → `"9"`), Radix fires `onValueChange("")` once. That empty string flows straight into the setter and clobbers the just-hydrated state to `""`, which matches no `SelectItem`, so the trigger renders blank. A sibling select whose hydrated value equals its initial default never changes its `value` prop, so it never triggers the spurious callback — which is why only *some* selects on a page break.

**Diagnosis tip:** Add a temporary `console.log` in the render and in the hydration effect dumping both the local state and the server field. Seeing `state="" serverField="9"` (state empty, server correct) is the fingerprint — it means a setter is overwriting the hydrated value, not that hydration failed.

**Fix:** Guard the handler to ignore falsy values: `onValueChange={(v) => v && setX(v)}`. Apply to every controlled Select whose value is hydrated/changed programmatically.

**Why it matters:** This masquerades as an API caching / state-hydration bug and sends you debugging the wrong layer (cache headers, effect deps) for a long time. The backend and the effect can both be correct while the Select itself destroys the value.
