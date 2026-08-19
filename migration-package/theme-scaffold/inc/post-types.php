<?php
// Register core post types: opportunity, partner, person, meddpicc_entry, reminder
add_action('init', function() {
    register_post_type('opportunity', [
        'labels' => ['name'=>'Opportunities','singular_name'=>'Opportunity'],
        'public' => true,
        'has_archive' => true,
        'show_in_rest' => true,
        'supports' => ['title','editor','author','thumbnail','custom-fields'],
        'rewrite' => ['slug' => 'opportunities'],
    ]);

    register_post_type('partner', [
        'labels' => ['name'=>'Partners','singular_name'=>'Partner'],
        'public' => true,
        'show_in_rest' => true,
        'supports' => ['title','editor','custom-fields'],
        'rewrite' => ['slug' => 'partners'],
    ]);

    register_post_type('person', [
        'labels' => ['name'=>'People','singular_name'=>'Person'],
        'public' => false,
        'show_ui' => true,
        'show_in_rest' => true,
        'supports' => ['title','custom-fields'],
    ]);

    register_post_type('meddpicc_entry', [
        'labels' => ['name'=>'MEDDPICC Entries','singular_name'=>'Meddpicc Entry'],
        'public' => false,
        'show_ui' => true,
        'show_in_rest' => true,
        'supports' => ['editor','custom-fields'],
    ]);

    register_post_type('reminder', [
        'labels' => ['name'=>'Reminders','singular_name'=>'Reminder'],
        'public' => false,
        'show_ui' => true,
        'show_in_rest' => true,
        'supports' => ['title','editor','custom-fields'],
    ]);
});
?>
