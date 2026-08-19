---
name: Single @types/react version required
description: Why the workspace pins @types/react to one 19.1.x version via catalog + pnpm overrides
---

The workspace must have exactly one `@types/react` (and `@types/react-dom`) version in the lockfile.

**Why:** Expo pins `@types/react@~19.1.x` while shadcn deps default to newer. With two versions, pnpm's hidden hoisted store (`node_modules/.pnpm/node_modules/@types/react`) gets one copy while artifacts link the other; packages without a `@types/react` dep (e.g. react-day-picker) fall through to the hoisted copy, producing "two different types with this name exist" errors in typecheck.

**How to apply:** Keep the `catalog:` entry and the `overrides:` for `@types/react` / `@types/react-dom` in `pnpm-workspace.yaml` in lockstep (currently ~19.1.x to satisfy Expo). After changing either, run `pnpm install` and confirm `grep -o '@types+react@[0-9.]*' pnpm-lock.yaml | sort -u` shows a single version, then `pnpm run typecheck`.
