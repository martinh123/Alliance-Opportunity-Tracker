# Alliance Opportunity Tracker — WordPress Migration Package

This migration package contains synthetic data, a WordPress theme scaffold (no plugins), importer scripts, REST route scaffolding, and styling assets to help an automated SiteGround WordPress builder recreate the app using WordPress core only.

Structure
- data/ — synthetic sample exports (opportunities, partners, people, users)
- metadata/ — routes and forms mapping
- styling/ — compiled/fallback CSS used by theme
- theme-scaffold/ — drop-in WordPress theme with inc/ importer and REST routes
- docs/ — runbook and deployment checklist

Notes
- This package uses only WordPress core functions in the theme scaffolding. The importer is designed to be run from WP-CLI or a secure admin-only trigger and removed after use.
- No secrets are included. Configure API keys or external integration secrets in wp-config.php as documented in docs/security-and-config.md.
