---
name: Auth implementation
description: How auth is implemented without bcrypt or express-session
---

The Replit pnpm package firewall blocks express-session and bcrypt from being installed. Auth is implemented using Node built-ins only.

**Password hashing:** `node:crypto` scrypt (lib/password.ts). Format: `<64-byte-hex>.<16-byte-salt-hex>`. Admin password seeded via raw pg client with scrypt hash.

**Sessions:** HMAC-SHA256 signed cookies (lib/auth.ts). Cookie name: `gsi_session`. Payload: `userId:timestamp`. Verified via `getUserIdFromCookie()` which also checks 7-day TTL.

**Why:** bcrypt is in the pnpm store (bcrypt@6.0.0) but never gets linked into api-server node_modules. express-session is not in the store at all and the package firewall blocks downloads.

**How to apply:** Any new auth check should import `requireAuth` from `src/lib/requireAuth.ts`, which calls `getUserIdFromCookie`. Never add bcrypt or express-session to package.json.
