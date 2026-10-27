<?php
/**
 * Title: Statistics (rating bars)
 * Slug: wp-ja-restaurant/acm-statistics-style-1
 * Description: A titled band over a picture with horizontal percentage bars and a review button (Joomla ACM statistics style-1 of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: statistics, stats, rating, bars, reviews
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"statistics.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:image {"sizeSlug":"full","className":"jr-section-bg","metadata":{"role":"content","name":"statistics.section-bg"}} -->
<figure class="wp-block-image size-full jr-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:heading {"className":"t3-section-title","metadata":{"role":"content","name":"statistics.module-title"}} -->
<h2 class="wp-block-heading t3-section-title"><?php esc_html_e( 'A title', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"t3-section-description","metadata":{"role":"content","name":"statistics.module-intro"}} -->
<p class="t3-section-description"><?php esc_html_e( 'A line under the title.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"uber-stats style-1","layout":{"type":"default"}} -->
<div class="wp-block-group uber-stats style-1">
<!-- wp:group {"className":"stats-list","layout":{"type":"default"}} -->
<div class="wp-block-group stats-list">
<!-- wp:group {"className":"col-xs-12 col-sm-12 stats-asset","metadata":{"name":"statistics.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group col-xs-12 col-sm-12 stats-asset">
<!-- wp:group {"layout":{"type":"default"}} -->
<div class="wp-block-group">
<!-- wp:paragraph {"className":"col-xs-12 stats-item-subject","metadata":{"role":"content","name":"statistics.stats-name.1"}} -->
<p class="col-xs-12 stats-item-subject"><?php esc_html_e( 'Excellent', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"col-xs-12 pull-right stats-item-counter","layout":{"type":"default"}} -->
<div class="wp-block-group col-xs-12 pull-right stats-item-counter">
<!-- wp:group {"className":"progressbar","layout":{"type":"default"}} -->
<div class="wp-block-group progressbar">
<!-- wp:paragraph {"className":"jr-stats-count","metadata":{"role":"content","name":"statistics.stats-count.1"}} -->
<p class="jr-stats-count"><?php esc_html_e( '85', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"text-center","layout":{"type":"default"}} -->
<div class="wp-block-group text-center">
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"btn btn-lg btn-primary jr-stats-button","metadata":{"role":"content","name":"statistics.button"}} -->
<div class="wp-block-button btn btn-lg btn-primary jr-stats-button"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Write a Review', 'wp-ja-restaurant' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
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
