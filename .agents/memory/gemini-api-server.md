---
name: Gemini in api-server (this monorepo)
description: Durable rules for wiring Gemini into the bundled Express api-server and handling its JSON output.
---

# Gemini in the bundled api-server

The api-server is bundled with esbuild, and the build externalizes `@google/*`.

**Rule:** any `@google/genai` usage must be a *direct* dependency of the
api-server package — a transitive copy is not enough, because the externalized
import resolves at runtime against the package's own node_modules.
**Why:** symptom is a runtime "cannot find module" even though typecheck passes.

## Gemini structured-output quirks
- **Rule:** never `JSON.parse` Gemini output directly — it embeds raw newlines
  inside string values, which is invalid JSON. Sanitize control chars inside
  strings first, then parse defensively.
- **Rule:** budget output tokens generously and constrain thinking budget for
  grounded structured output. Thinking tokens otherwise consume the budget and
  truncate the JSON mid-string. Lower temperature stabilizes results.
- **How to apply:** reuse the existing sanitize+parse helpers and the tuned
  generateContent config for any new structured Gemini call in this repo.
- **Rule:** grounded (googleSearch) calls also emit unescaped inner quotes that
  break JSON even after control-char sanitation, and `responseMimeType:
  "application/json"` cannot be combined with the googleSearch tool. For simple
  shapes, wrap parse in try/catch and fall back to treating the raw text as the
  payload (strip fences/JSON scaffolding, unescape \n/\"), pulling sources from
  grounding metadata instead of failing the request.
- **Why:** a strict-parse-only path 502s ~intermittently on real grounded
  responses (observed mid-string quote breakage), and each failed call wastes
  60-90s of user wait.

## Testing slow (60-120s) endpoints from the agent shell
- Background/`setsid`/`nohup` processes are killed when the bash tool call
  ends — a detached curl gets aborted ~1s after launch. Launch the request and
  `wait` for it *inside the same bash command* (parallel curls + `wait` fits
  two ~90s calls in one 118s-timeout command).
