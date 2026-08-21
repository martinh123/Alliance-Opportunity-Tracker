# Migration Notes

## Current application

- Frontend: React + Vite + TypeScript + Tailwind/shadcn-style UI.
- Backend: Express 5 + TypeScript + OpenAPI-first routes.
- Database: PostgreSQL + Drizzle ORM.
- Authentication: custom scrypt password hashing and HMAC-signed cookie sessions; WordPress should use native WordPress authentication and capabilities instead of copying the cookie format.
- AI: Replit-managed Gemini integration for presentation-only company intelligence.
- Geocoding: Nominatim with a server-side cache.

## WordPress target

- Use a custom must-use plugin for tables, REST endpoints, auth/capabilities, import/export, and business logic.
- Use a custom theme for the dashboard shell and page views.
- Preserve tenant scoping, admin/rep roles, weighted MEDDPICC scoring, contact directories, reminders, outcomes, and AI presentation-only boundaries.
- Do not use ZIP files as source inputs. Copilot should read the plain-text and source directories in this folder.

## Data safety

- No production database rows, password hashes, API keys, cookies, private keys, or `.env` files are included.
- No WXR/XML export was found; see `reference/WORDPRESS-EXPORT-NOT-FOUND.txt`.
- The source copy has the generic development secret fallback redacted. Configure `SESSION_SECRET` in the destination environment.
