<?php
/**
 * Title: Timeline
 * Slug: wp-ja-restaurant/acm-timeline-style-1
 * Description: A vertical timeline of dated milestones, each with a clock icon, a picture, a title and a text (Joomla ACM timeline style-1 of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: timeline, history, milestones, dates
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"timeline.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:heading {"className":"t3-section-title","metadata":{"role":"content","name":"timeline.module-title"}} -->
<h2 class="wp-block-heading t3-section-title"><?php esc_html_e( 'A title', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"t3-section-description","metadata":{"role":"content","name":"timeline.module-intro"}} -->
<p class="t3-section-description"><?php esc_html_e( 'A line under the title.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"acm-timeline style-1","layout":{"type":"default"}} -->
<div class="wp-block-group acm-timeline style-1">
<!-- wp:group {"className":"timeline-list","layout":{"type":"default"}} -->
<div class="wp-block-group timeline-list">
<!-- wp:group {"className":"item-row","metadata":{"name":"timeline.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group item-row">
<!-- wp:group {"className":"timeline-item","layout":{"type":"default"}} -->
<div class="wp-block-group timeline-item">
<!-- wp:group {"className":"item-icon","layout":{"type":"default"}} -->
<div class="wp-block-group item-icon">
<!-- wp:paragraph -->
<p><i class="fa fa-clock-o"></i></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"item-date","metadata":{"role":"content","name":"timeline.date.1"}} -->
<p class="item-date"><?php esc_html_e( '2000-01-01', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"item-content","layout":{"type":"default"}} -->
<div class="wp-block-group item-content">
<!-- wp:group {"className":"item-body media","layout":{"type":"default"}} -->
<div class="wp-block-group item-body media">
<!-- wp:image {"sizeSlug":"full","className":"media-object","metadata":{"role":"content","name":"timeline.image.1"}} -->
<figure class="wp-block-image size-full media-object"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"media-body","layout":{"type":"default"}} -->
<div class="wp-block-group media-body">
<!-- wp:heading {"level":3,"className":"item-title","metadata":{"role":"content","name":"timeline.title.1"}} -->
<h3 class="wp-block-heading item-title"><?php esc_html_e( 'A milestone', 'wp-ja-restaurant' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"item-ct","metadata":{"role":"content","name":"timeline.description.1"}} -->
<p class="item-ct"><?php esc_html_e( 'A few lines about what happened.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
