# Importer Runbook

Steps to run the importer on SiteGround (recommended via WP-CLI):

1. Upload the migration-package directory into your WP installation root: wp-content/migration-package/ (use SFTP or File Manager).
2. Upload the theme-scaffold to wp-content/themes/ and activate the theme.
3. Ensure the data JSON files are placed at wp-content/migration-package/data/*.json (the package includes them already when using the branch zip).
4. SSH into the SiteGround account (if available) and run:

   wp --path=/home/YOURUSER/public_html eval-file wp-content/migration-package/theme-scaffold/inc/importer.php

   or

   wp --path=/home/YOURUSER/public_html eval 'require_once "wp-content/migration-package/theme-scaffold/inc/importer.php"; echo aot_import_all_from_migration_package();'

5. If SSH is not available, create a temporary admin-only PHP file to call aot_import_all_from_migration_package() and remove it immediately after import. (The theme includes importer scaffolding; follow docs/security-and-config.md)

6. Verify imported content in WP admin and delete importer.php and any temporary runner.
