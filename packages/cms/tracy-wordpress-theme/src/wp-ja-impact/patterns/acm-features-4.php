<?php
/**
 * Title: Features stats
 * Slug: wp-ja-impact/acm-features-4
 * Description: A heading column (eyebrow, headline, lead) beside a grid of one to three white stat cards, each with a small picture, a coloured figure and a line of text, on the navy band (Joomla ACM `features` style-4 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, stats, numbers, band, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-features style-4 jim-band jim-band--primary text-start","metadata":{"name":"features.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-features style-4 jim-band jim-band--primary text-start">
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"feature-row","layout":{"type":"default"}} -->
<div class="wp-block-group feature-row">
<!-- wp:group {"className":"feature-head","metadata":{"name":"features.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group feature-head">
<!-- wp:heading {"level":6,"className":"feature-tag","metadata":{"role":"content","name":"features.feature-tag"}} -->
<h6 class="wp-block-heading feature-tag"><?php esc_html_e( 'A small label', 'wp-ja-impact' ); ?></h6>
<!-- /wp:heading -->
<!-- wp:heading {"level":2,"className":"feature-title","metadata":{"role":"content","name":"features.feature-title"}} -->
<h2 class="wp-block-heading feature-title"><?php esc_html_e( 'A section headline', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead","metadata":{"role":"content","name":"features.feature-desc"}} -->
<p class="lead"><?php esc_html_e( 'A lead of two or three lines.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"feature-list sub-col-3","metadata":{"name":"features.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group feature-list sub-col-3">
<!-- wp:group {"className":"item","metadata":{"name":"features.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group item">
<!-- wp:group {"className":"item-detail","layout":{"type":"default"}} -->
<div class="wp-block-group item-detail">
<!-- wp:image {"sizeSlug":"full","className":"item-media","metadata":{"role":"content","name":"features.sub-feature-img.1"}} -->
<figure class="wp-block-image size-full item-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":2,"className":"item-title text-success","metadata":{"role":"content","name":"features.sub-feature-title.1"}} -->
<h2 class="wp-block-heading item-title text-success"><?php esc_html_e( '100', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"item-des","metadata":{"role":"content","name":"features.sub-feature-desc.1"}} -->
<p class="item-des"><?php esc_html_e( 'What the figure counts', 'wp-ja-impact' ); ?></p>
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
