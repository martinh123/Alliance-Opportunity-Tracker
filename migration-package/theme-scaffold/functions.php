/*
Theme Name: Alliance Opportunity Tracker - Migration Theme
Description: Minimal scaffold theme generated from repository artifacts to import data and provide templates. No third-party plugins used.
Version: 0.1.0
Author: Copilot
*/

/* Basic enqueue and includes */

<?php
add_action('wp_enqueue_scripts', function() {
    $theme_dir = get_stylesheet_directory_uri();
    $css_file = '/migration-package/styling/style.css';
    // Enqueue the packaged styling
    wp_enqueue_style('aot-theme-style', $theme_dir . $css_file, [], null);
});

// Include scaffold files
$inc = __DIR__ . '/inc';
if (file_exists($inc . '/post-types.php')) require_once $inc . '/post-types.php';
if (file_exists($inc . '/rest-routes.php')) require_once $inc . '/rest-routes.php';
if (file_exists($inc . '/importer.php')) require_once $inc . '/importer.php';
?>
