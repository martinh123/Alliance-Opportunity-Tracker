# Routes mapping

This file maps the React routes in the original app to WordPress templates and notes about auth and behavior.

- /login -> page-login.php (public) — login form handled by WP auth or custom REST endpoint
- /dashboard -> page-dashboard.php (requires login) — aggregated WP pages using WP queries
- /opportunities -> archive-opportunity.php (requires login) — list with filters (partnerId, stage, ownerId, closeDate range)
- /opportunities/:id -> single-opportunity.php (requires login) — show opportunity details, MEDDPICC entries, related contacts
- /partners -> archive-partner.php (requires login) — partner listing
- /outcomes -> page-outcomes.php (requires login)
- /nearby -> page-nearby.php (requires login) — uses people search endpoint
- /admin/users -> page-admin-users.php (admin only) — user management UI
- /profile -> page-profile.php (requires login) — user profile settings

Notes:
- Use WP nonce checks on forms. Use WP roles/capabilities mapping for owner/admin checks.
