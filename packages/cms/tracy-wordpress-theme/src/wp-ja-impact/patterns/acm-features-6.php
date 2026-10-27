<?php
/**
 * Title: Campaign card
 * Slug: wp-ja-impact/acm-features-6
 * Description: A navy textured card with a green kicker, a headline, a lead, two percentage bars (charity, donation) and icon panels (ACM features style-6 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, campaign, fundraising, progress, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm ja-acm acm-features style-6","metadata":{"name":"features.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm ja-acm acm-features style-6">
<!-- wp:group {"className":"main-feature","layout":{"type":"default"}} -->
<div class="wp-block-group main-feature">
<!-- wp:group {"className":"feature-content","layout":{"type":"default"}} -->
<div class="wp-block-group feature-content">
<!-- wp:heading {"level":6,"className":"sub-title","metadata":{"role":"content","name":"features.feature-subtitle"}} -->
<h6 class="wp-block-heading sub-title"><?php esc_html_e( 'Helping hands', 'wp-ja-impact' ); ?></h6>
<!-- /wp:heading -->
<!-- wp:heading {"level":2,"className":"title","metadata":{"role":"content","name":"features.feature-title"}} -->
<h2 class="wp-block-heading title"><?php esc_html_e( 'A campaign headline', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead","metadata":{"role":"content","name":"features.feature-desc"}} -->
<p class="lead"><?php esc_html_e( 'Morbi in sem quis dui placerat ornare.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jim-progress feature-charity","metadata":{"name":"features.charity"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-progress feature-charity">
<!-- wp:heading {"level":5,"className":"jim-progress__label","metadata":{"role":"content","name":"features.charity-title"}} -->
<h5 class="wp-block-heading jim-progress__label"><?php esc_html_e( 'Charity', 'wp-ja-impact' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-progress__pct current-percent","metadata":{"role":"content","name":"features.feature-charity-pct"}} -->
<p class="jim-progress__pct current-percent">50%</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-progress feature-donation","metadata":{"name":"features.donation"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-progress feature-donation">
<!-- wp:heading {"level":5,"className":"jim-progress__label","metadata":{"role":"content","name":"features.donation-title"}} -->
<h5 class="wp-block-heading jim-progress__label"><?php esc_html_e( 'Donation', 'wp-ja-impact' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-progress__pct current-percent","metadata":{"role":"content","name":"features.feature-donation-pct"}} -->
<p class="jim-progress__pct current-percent">50%</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"sub-feature","metadata":{"name":"features.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group sub-feature">
<!-- wp:image {"sizeSlug":"full","className":"sub-media","metadata":{"role":"content","name":"features.sub-feature-media.1"}} -->
<figure class="wp-block-image size-full sub-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"sub-content","layout":{"type":"default"}} -->
<div class="wp-block-group sub-content">
<!-- wp:heading {"level":4,"className":"sub-feature-title","metadata":{"role":"content","name":"features.sub-feature-title.1"}} -->
<h4 class="wp-block-heading sub-feature-title"><?php esc_html_e( 'Our Mission', 'wp-ja-impact' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"sub-feature-desc","metadata":{"role":"content","name":"features.sub-feature-desc.1"}} -->
<p class="sub-feature-desc"><?php esc_html_e( 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
