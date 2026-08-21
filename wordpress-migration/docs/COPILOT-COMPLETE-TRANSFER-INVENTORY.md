# Copilot Complete Transfer Inventory

This document answers the complete transfer checklist for the Alliance Opportunity
Tracker. The GitHub repository is the source delivery mechanism; no ZIP file is
required or used.

## 1. Full project source

Repository:

<https://github.com/martinh123/Alliance-Opportunity-Tracker>

Migration reference root:

`wordpress-migration/`

The reference tree contains ordinary source files and is organized as follows:

| Requested material | Repository location |
| --- | --- |
| React/Vite frontend source | `wordpress-migration/source/artifacts/gsi-tracker/src/` |
| Frontend public assets | `wordpress-migration/source/artifacts/gsi-tracker/public/` |
| Express API source | `wordpress-migration/source/artifacts/api-server/src/` |
| API build script and manifest | `wordpress-migration/source/artifacts/api-server/build.mjs` and `package.json` |
| Shared database source | `wordpress-migration/source/lib/db/` |
| Generated API client source | `wordpress-migration/source/lib/api-client-react/` |
| Generated API validation/types | `wordpress-migration/source/lib/api-zod/` |
| OpenAPI source/configuration | `wordpress-migration/source/lib/api-spec/` |
| Gemini integration source | `wordpress-migration/source/lib/integrations-gemini-ai/` |
| Utility/migration scripts | `wordpress-migration/source/scripts/` |
| Sanitized project configuration | `wordpress-migration/config/` |

The complete file list is maintained in
`wordpress-migration/reference/manifest.txt`.

### Package and TypeScript manifests

The authoritative package manager is pnpm. There is no authoritative
`package-lock.json`; do not generate or substitute one.

- Root package manifest: `wordpress-migration/reference/package.json`
- Workspace lockfile: `wordpress-migration/reference/pnpm-lock.yaml`
- Workspace definition: `wordpress-migration/reference/pnpm-workspace.yaml`
- Root TypeScript project: `wordpress-migration/reference/tsconfig.json`
- Root TypeScript base config: `wordpress-migration/reference/tsconfig.base.json`
- Frontend manifest/config: `source/artifacts/gsi-tracker/package.json` and `tsconfig.json`
- API manifest/config: `source/artifacts/api-server/package.json` and `tsconfig.json`
- Database manifest/config: `source/lib/db/package.json` and `tsconfig.json`
- API client, API types, Gemini integration, and script manifests/configs are
  present under their corresponding `source/lib/` and `source/scripts/` folders.

The original repository root also contains the same root `package.json`,
`pnpm-lock.yaml`, and TypeScript workspace files. The `wordpress-migration/source/`
tree is the organized migration copy; it is not intended to be installed as a
standalone package without the root manifest files from `reference/`.

## 2. Build output

No generated `dist/` or `build/` output is committed. This is intentional:
generated output is reproducible and was excluded to avoid stale bundles and
dependency artifacts.

The checked-in `public/` directory is source content and is included:

- `favicon.svg`
- `opengraph.jpg`
- `robots.txt`
- the public OpenAPI/schema reference files

The frontend Vite configuration writes generated output to
`dist/public/` when built.

## 3. API specification and source

OpenAPI files:

- Canonical: `wordpress-migration/source/lib/api-spec/openapi.yaml`
- Reference copy: `wordpress-migration/reference/openapi.yaml`
- Frontend public copy: `wordpress-migration/source/artifacts/gsi-tracker/public/openapi.yaml`

API application and route source:

- Application setup: `source/artifacts/api-server/src/app.ts`
- Server entrypoint: `source/artifacts/api-server/src/index.ts`
- Route registration: `source/artifacts/api-server/src/routes/index.ts`
- Route handlers: every TypeScript file in
  `source/artifacts/api-server/src/routes/`
- Authentication and session reference:
  `source/artifacts/api-server/src/lib/auth.ts`
- Password hashing reference:
  `source/artifacts/api-server/src/lib/password.ts`
- Organization/admin guards:
  `source/artifacts/api-server/src/lib/requireAuth.ts` and
  `source/artifacts/api-server/src/lib/requireAdmin.ts`
- Company intelligence:
  `source/artifacts/api-server/src/lib/companyIntel.ts`
- Geocoding and nearby-contact support:
  `source/artifacts/api-server/src/lib/geocode.ts`

The source API uses `/api/*`. The WordPress port must expose the equivalent
behavior under `/wp-json/gsi/v1/`, preserving request/response fields,
validation, permission checks, and organization scoping.

The complete endpoint contract is in the OpenAPI file and the route inventory is
also available at `wordpress-migration/reference/gsi-route-map.json`.

## 4. Environment variable names and usage

Only names are included here. No values, secrets, cookies, hashes, or private
configuration are included anywhere in the migration tree.

| Variable | Source use |
| --- | --- |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini integration credential; configure through protected destination secrets. |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini/Replit integration endpoint base URL. |
| `BASE_PATH` | Vite/mobile asset and route base path. |
| `DATABASE_URL` | PostgreSQL connection used by Drizzle and migration scripts. |
| `EXPO_PUBLIC_DOMAIN` | Expo/mobile public domain configuration. |
| `EXPO_PUBLIC_REPL_ID` | Expo/mobile Replit runtime identifier. |
| `LOG_LEVEL` | API logger verbosity. |
| `NODE_ENV` | Development/production behavior for API and Vite configuration. |
| `PORT` | HTTP server/Vite port; the API binds to this value. |
| `REPLIT_DEV_DOMAIN` | Development-domain behavior used by selected source features. |
| `REPLIT_EXPO_DEV_DOMAIN` | Expo development-domain configuration. |
| `REPLIT_INTERNAL_APP_DOMAIN` | Expo/mobile internal app-domain configuration. |
| `REPL_ID` | Replit runtime identifier and development-plugin gating. |
| `SESSION_SECRET` | HMAC session signing secret in the original API only; do not copy this auth design to WordPress. |

The same names are listed in:

- `wordpress-migration/config/env-vars-list.txt`
- `wordpress-migration/config/.env.example`

The destination WordPress build should use native WordPress authentication,
nonces, roles, capabilities, and secure cookies. It must not reuse the original
session secret, cookie format, or password hashes.

## 5. README and run/build instructions

Migration overview:

`wordpress-migration/README.md`

Architecture notes:

`wordpress-migration/docs/MIGRATION-NOTES.md`

The original source uses Node `v24.13.0` and pnpm `10.26.1`. From the original
repository root, the exact source verification commands are:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/gsi-tracker run build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server test
```

Development commands:

```bash
pnpm --filter @workspace/gsi-tracker run dev
pnpm --filter @workspace/api-server run dev
```

The frontend requires `PORT` and `BASE_PATH`. The API requires its configured
database connection and the environment names listed above. The API `dev`
script builds first and then starts the generated `dist/index.mjs`.

For SiteGround, these Node commands are source-reference checks only. The
production target is a custom WordPress PHP application: activate the
must-use plugin, activate the custom theme, configure the SiteGround database
and protected AI settings, enable pretty permalinks, and verify the
`/wp-json/gsi/v1/` REST namespace.

## 6. Data export

No raw production SQL dump is included. The original database model is fully
represented by:

- Schema SQL: `wordpress-migration/reference/gsi-current-database-schema.sql`
- Readable schema: `wordpress-migration/reference/gsi-current-database-schema.md`
- Structured schema: `wordpress-migration/reference/gsi-current-database-schema.json`
- Drizzle source tables: `wordpress-migration/source/lib/db/src/schema/`
- SQL migrations: `wordpress-migration/source/lib/db/migrations/`

The requested live tables are covered by the schema and source definitions,
including opportunities, partners, users/organizations, partner resources,
internal resources, MEDDPICC tables, company research, reminders, and
geocode cache.

For test/import development, use:

`wordpress-migration/database-reference/sanitized-admin-export-v2.json`

This is a valid version-2 administrator-export-shaped fixture. It preserves
entity names, fields, JSON shapes, relationships, and representative values,
but all records are fictional and credential fields are explicit redactions.
See `wordpress-migration/database-reference/EXPORT-LIMITATIONS.md`.

Therefore the WordPress migration should start with a fresh SiteGround
WordPress database and use fictional seed content only while building and
testing. A protected real backup can be imported later through a controlled
administrator-only process; it must not be committed to Git.

## 7. WordPress content export

There is no complete WXR/XML export because the application did not use
WordPress posts, pages, or plugin content as its data model. A repository search
found no `.xml` or WXR file. The migration is a custom-table and REST migration,
not a Tools → Export content import.

The explicit record of this is:

`wordpress-migration/reference/WORDPRESS-EXPORT-NOT-FOUND.txt`

Do not block the build waiting for a WXR file.

## 8. Assets and media

Frontend assets:

`wordpress-migration/source/artifacts/gsi-tracker/public/`

Migration visual references:

`wordpress-migration/assets/gsi-svg-screens/`

Included screen references:

- `00-contact-sheet.svg`
- `01-login.svg`
- `02-dashboard.svg`
- `03-opportunity-detail.svg`
- `04-partners.svg`
- `05-outcomes.svg`
- `06-nearby.svg`
- `07-admin-users.svg`
- `08-profile.svg`
- `09-not-found.svg`

Additional screenshot:

`wordpress-migration/assets/screenshots/gsi-login-live.jpg`

The current source does not include a separate custom font file. It uses the
CSS font stacks documented below, with system fallbacks.

## 9. Design and styling information

Primary styling source:

`wordpress-migration/source/artifacts/gsi-tracker/src/index.css`

The app uses Tailwind CSS v4 through `@tailwindcss/vite`, with CSS custom
properties for the design tokens. There is no separate legacy Tailwind config
file; the token definitions are in `index.css`.

Key visual tokens:

- Background: HSL `220 20% 97%`
- Foreground/deep navy: HSL `222 47% 11%`
- Sidebar: HSL `222 47% 11%`
- Sidebar accent: HSL `222 35% 18%`
- Primary/active blue: HSL `217 91% 60%`
- Border: HSL `220 13% 88%`
- Muted surface: HSL `220 14% 95%`
- Destructive: HSL `0 84% 60%`
- Base radius: `0.5rem`

Font stacks:

- Sans: `Inter`, `system-ui`, `sans-serif`
- Serif: `Georgia`, `serif`
- Monospace: `JetBrains Mono`, `Menlo`, `monospace`

The visual target is a deep navy/slate command-center application with a light
content canvas, blue primary actions, responsive cards/tables, clear loading
and empty states, and explicit destructive-action confirmations.

## 10. Reimplementation choice

Use a pixel-conscious custom WordPress implementation, not a block-based
recreation and not an existing theme with minimal custom blocks.

Required target architecture:

1. A custom must-use plugin for custom tables, schema activation/migrations,
   REST controllers, permission callbacks, organization scoping,
   import/export, validation, and business rules.
2. A custom theme for the application shell, login, dashboard, opportunity
   detail, partner/resource directories, outcomes, nearby contacts, admin
   users, profile/settings, loading/empty/not-found states, and responsive
   behavior.
3. Custom PHP, JavaScript, and CSS only. Do not require a third-party WordPress
   plugin, page builder, or component library.
4. Use native WordPress users, roles, capabilities, nonces, and secure
   authentication rather than copying the Express session implementation.

The visual port should closely reproduce the existing React/Vite navigation,
page hierarchy, field behavior, navy/slate token system, and responsive states.
The WordPress REST layer should preserve the existing API behavior while moving
the public namespace from `/api` to `/wp-json/gsi/v1/`.

## 11. Supporting references

- Build specification: `wordpress-migration/reference/gsi-wordpress-build-spec.html`
- Current schema: `wordpress-migration/reference/gsi-current-database-schema.md`
- API contract: `wordpress-migration/reference/openapi.yaml`
- Route map: `wordpress-migration/reference/gsi-route-map.json`
- Full manifest: `wordpress-migration/reference/manifest.txt`
- Source architecture notes: `wordpress-migration/docs/MIGRATION-NOTES.md`
- Sanitized admin-export fixture:
  `wordpress-migration/database-reference/sanitized-admin-export-v2.json`