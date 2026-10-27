<?php
/**
 * Title: Feature with picture
 * Slug: wp-ja-impact/acm-features-1
 * Description: A tag, a large title, a lead and an optional button or picture-and-text rows beside a rounded main picture on the left, the right or none (ACM features style-1 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, intro, activities, picture, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm ja-acm acm-features style-1","metadata":{"name":"features.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm ja-acm acm-features style-1">
<!-- wp:group {"className":"feature-row media-right","metadata":{"name":"features.row"},"layout":{"type":"default"}} -->
<div class="wp-block-group feature-row media-right">
<!-- wp:group {"className":"feature-content","layout":{"type":"default"}} -->
<div class="wp-block-group feature-content">
<!-- wp:heading {"level":6,"className":"feature-tag","metadata":{"role":"content","name":"features.feature-tag"}} -->
<h6 class="wp-block-heading feature-tag"><?php esc_html_e( 'Our Activities', 'wp-ja-impact' ); ?></h6>
<!-- /wp:heading -->
<!-- wp:heading {"level":2,"className":"feature-title","metadata":{"role":"content","name":"features.feature-title"}} -->
<h2 class="wp-block-heading feature-title"><?php esc_html_e( 'A title over two lines', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead","metadata":{"role":"content","name":"features.feature-desc"}} -->
<p class="lead"><?php esc_html_e( 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"feature-action"} -->
<div class="wp-block-buttons feature-action">
<!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"role":"content","name":"features.label"}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Get a quote', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:group {"className":"sub-features flex-row","metadata":{"name":"features.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group sub-features flex-row">
<!-- wp:image {"sizeSlug":"full","className":"sub-media","metadata":{"role":"content","name":"features.sub-feature-img.1"}} -->
<figure class="wp-block-image size-full sub-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"sub-des","metadata":{"role":"content","name":"features.sub-feature-desc.1"}} -->
<p class="sub-des"><?php esc_html_e( 'A few lines that sit beside the small picture.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:image {"sizeSlug":"full","className":"feature-media","metadata":{"role":"content","name":"features.feature-main-img"}} -->
<figure class="wp-block-image size-full feature-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
