<?php
// Simple REST endpoints that mirror a subset of the OpenAPI shapes for compatibility.
add_action('rest_api_init', function () {
    register_rest_route('custom/v1', '/opportunities', [
        'methods' => 'GET',
        'callback' => function($request) {
            $args = ['post_type'=>'opportunity','posts_per_page'=>50];
            $posts = get_posts($args);
            $out = [];
            foreach ($posts as $p) {
                $out[] = ['id'=>$p->ID,'title'=>$p->post_title,'body'=>$p->post_content];
            }
            return rest_ensure_response($out);
        },
        'permission_callback' => function() { return current_user_can('read'); }
    ]);

    register_rest_route('custom/v1', '/opportunities', [
        'methods' => 'POST',
        'callback' => function($request) {
            if (!current_user_can('edit_posts')) return new WP_Error('forbidden', 'Insufficient permissions', ['status'=>403]);
            $body = $request->get_json_params();
            $post_id = wp_insert_post([
                'post_type'=>'opportunity',
                'post_title'=>sanitize_text_field($body['title'] ?? 'Untitled'),
                'post_content'=>wp_kses_post($body['body'] ?? ''),
                'post_status'=>'publish'
            ]);
            if (is_wp_error($post_id)) return $post_id;
            if (!empty($body['value'])) update_post_meta($post_id,'_opp_value',floatval($body['value']));
            return rest_ensure_response(['id'=>$post_id]);
        },
        'permission_callback' => function() { return current_user_can('edit_posts'); }
    ]);
});
?>
