<?php
/**
 * One-shot importer: reads migration-package/data/*.json and imports into WP using core APIs.
 * Designed to be invoked via WP-CLI or an admin-only runner and removed after use.
 */

function aot_import_all_from_migration_package() {
    if (!defined('WP_CLI') && !current_user_can('manage_options')) {
        return 'forbidden';
    }
    $base = ABSPATH . 'wp-content/migration-package/data/';
    if (!file_exists($base)) return 'no_data_dir';

    // Import users
    $users_file = $base . 'users.json';
    if (file_exists($users_file)) {
        $users = json_decode(file_get_contents($users_file), true);
        foreach ($users as $u) {
            $email = sanitize_email($u['email'] ?? '');
            if (!$email) continue;
            if (email_exists($email)) continue;
            $password = wp_generate_password(12, true);
            $user_id = wp_create_user($email, $password, $email);
            if (!is_wp_error($user_id)) {
                wp_update_user(['ID'=>$user_id,'first_name'=>sanitize_text_field($u['first_name'] ?? ''),'last_name'=>sanitize_text_field($u['last_name'] ?? '')]);
                update_user_meta($user_id,'aot_external_id',sanitize_text_field($u['external_id'] ?? ''));
                update_user_meta($user_id,'aot_generated_password',$password);
                // Map role
                $role = $u['role'] ?? 'subscriber';
                $wp_user = new WP_User($user_id);
                $wp_user->set_role($role);
            }
        }
    }

    // Import partners
    $partners_file = $base . 'partners.json';
    if (file_exists($partners_file)) {
        $partners = json_decode(file_get_contents($partners_file), true);
        foreach ($partners as $p) {
            $post_id = wp_insert_post(['post_type'=>'partner','post_title'=>sanitize_text_field($p['name']),'post_status'=>'publish']);
            if (!is_wp_error($post_id)) update_post_meta($post_id,'aot_external_id',sanitize_text_field($p['external_id']));
        }
    }

    // Import people
    $people_file = $base . 'people.json';
    if (file_exists($people_file)) {
        $people = json_decode(file_get_contents($people_file), true);
        foreach ($people as $pp) {
            $post_id = wp_insert_post(['post_type'=>'person','post_title'=>sanitize_text_field($pp['name']),'post_status'=>'publish']);
            if (!is_wp_error($post_id)) {
                update_post_meta($post_id,'email',sanitize_email($pp['email'] ?? ''));
                update_post_meta($post_id,'title',sanitize_text_field($pp['title'] ?? ''));
                update_post_meta($post_id,'aot_external_id',sanitize_text_field($pp['external_id'] ?? ''));
            }
        }
    }

    // Import opportunities
    $opps_file = $base . 'opportunities.json';
    if (file_exists($opps_file)) {
        $opps = json_decode(file_get_contents($opps_file), true);
        foreach ($opps as $o) {
            $post_id = wp_insert_post(['post_type'=>'opportunity','post_title'=>sanitize_text_field($o['title']),'post_content'=>wp_kses_post($o['body'] ?? ''),'post_status'=>'publish']);
            if (!is_wp_error($post_id)) {
                update_post_meta($post_id,'_opp_value',floatval($o['value'] ?? 0));
                update_post_meta($post_id,'_opp_stage',sanitize_text_field($o['stage'] ?? ''));
                update_post_meta($post_id,'_opp_type',sanitize_text_field($o['type'] ?? ''));
                update_post_meta($post_id,'aot_external_id',sanitize_text_field($o['external_id'] ?? ''));
            }
        }
    }

    return 'done';
}

// If invoked via WP-CLI eval-file, run automatically
if (defined('WP_CLI') && WP_CLI) {
    aot_import_all_from_migration_package();
}
?>
