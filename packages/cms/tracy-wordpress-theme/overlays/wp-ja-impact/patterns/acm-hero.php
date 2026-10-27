<?php
/**
 * Title: Hero slider
 * Slug: wp-ja-impact/acm-hero
 * Description: A full-width picture slider: each slide has a green kicker, a large headline, a lead and up to two buttons over a left-to-right dark gradient, stepped by dots and arrows (ACM hero style-1 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: hero, slider, carousel, banner, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-hero style-1 tracy-motion-carousel tracy-motion-carousel--dots tracy-motion-carousel--nav","metadata":{"name":"hero.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-hero style-1 tracy-motion-carousel tracy-motion-carousel--dots tracy-motion-carousel--nav">
<!-- wp:group {"className":"tracy-motion-track","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"acm-hero-item item","metadata":{"name":"hero.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group acm-hero-item item">
<!-- wp:image {"sizeSlug":"full","className":"jim-hero__bg","metadata":{"role":"content","name":"hero.image-hero.1"}} -->
<figure class="wp-block-image size-full jim-hero__bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"hero-content","layout":{"type":"default"}} -->
<div class="wp-block-group hero-content">
<!-- wp:paragraph {"className":"h4 sub-title","metadata":{"role":"content","name":"hero.sub-title.1"}} -->
<p class="h4 sub-title"><?php esc_html_e( 'All-in-one Giving', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"hero-title","metadata":{"role":"content","name":"hero.title.1"}} -->
<h1 class="wp-block-heading hero-title"><?php esc_html_e( 'How to engage help our planet', 'wp-ja-impact' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"description","metadata":{"role":"content","name":"hero.desc.1"}} -->
<p class="description"><?php esc_html_e( 'We want to make giving simple, fun and meaningful for you.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"acm-action"} -->
<div class="wp-block-buttons acm-action">
<!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"role":"content","name":"hero.button.1"}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Get help now', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"role":"content","name":"hero.button-2.1"}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Learn more', 'wp-ja-impact' ); ?></a></div>
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
</section>
<!-- /wp:group -->
