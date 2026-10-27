<?php
/**
 * Title: Features cards
 * Slug: wp-ja-impact/acm-features-2
 * Description: A grid of cards under a centred heading: each card sets its own column width, colour, text alignment and the side its picture sits on, a coloured gradient fading the picture into the card (Joomla ACM `features` style-2 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, cards, grid, picture, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-features style-2","metadata":{"name":"features.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-features style-2">
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"section-title-wrap","metadata":{"name":"features.heading"},"layout":{"type":"default"}} -->
<div class="wp-block-group section-title-wrap">
<!-- wp:paragraph {"className":"sub-title","metadata":{"role":"content","name":"features.module-sub-title"}} -->
<p class="sub-title"><?php esc_html_e( 'A small label', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"section-title","metadata":{"role":"content","name":"features.module-title"}} -->
<h2 class="wp-block-heading section-title"><?php esc_html_e( 'A section headline', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"feature-list","metadata":{"name":"features.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group feature-list">
<!-- wp:group {"className":"ft-item col-md-6","metadata":{"name":"features.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group ft-item col-md-6">
<!-- wp:group {"className":"ft-item-detail media-left bg-primary text-start","metadata":{"name":"features.card.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group ft-item-detail media-left bg-primary text-start">
<!-- wp:image {"sizeSlug":"full","className":"item-media","metadata":{"role":"content","name":"features.sub-feature-img.1"}} -->
<figure class="wp-block-image size-full item-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"item-content","metadata":{"name":"features.content.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group item-content">
<!-- wp:heading {"level":3,"className":"item-title","metadata":{"role":"content","name":"features.sub-feature-title.1"}} -->
<h3 class="wp-block-heading item-title"><?php esc_html_e( 'A card title', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"item-des","metadata":{"role":"content","name":"features.sub-feature-desc.1"}} -->
<p class="item-des"><?php esc_html_e( 'A few lines that say what the card is about.', 'wp-ja-impact' ); ?></p>
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
</section>
<!-- /wp:group -->
