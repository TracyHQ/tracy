<?php
/**
 * Title: Team carousel
 * Slug: wp-ja-vega/section-teams
 * Description: A label and headline with previous / next arrows on the right, over a carousel of people (Joomla ACM `teams` style-1): a portrait, a name and a position per slide, four to a view on a wide screen, one on a phone; nothing moves on its own.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: team, people, carousel, slider, staff, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-teams","metadata":{"name":"teams.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-teams">
<!-- wp:image {"sizeSlug":"full","className":"jv-bg jv-bg--wave","metadata":{"role":"content","name":"teams.section-bg"}} -->
<figure class="wp-block-image size-full jv-bg jv-bg--wave"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-teams__top","layout":{"type":"default"}} -->
<div class="wp-block-group jv-teams__top">
<!-- wp:group {"className":"jv-head jv-head--start tracy-motion-reveal","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head jv-head--start tracy-motion-reveal">
<!-- wp:heading {"level":3,"className":"jv-pill","metadata":{"role":"content","name":"teams.team-title"}} -->
<h3 class="wp-block-heading jv-pill"><?php esc_html_e( 'Our team', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title","metadata":{"role":"content","name":"teams.team-desc"}} -->
<p class="jv-main-title"><?php esc_html_e( 'Meet the minds behind our success', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"jv-arrows tracy-motion-reveal tracy-motion-delay-1"} -->
<div class="wp-block-buttons jv-arrows tracy-motion-reveal tracy-motion-delay-1">
<!-- wp:button {"className":"jv-arrow jv-arrow--prev tracy-motion-prev"} -->
<div class="wp-block-button jv-arrow jv-arrow--prev tracy-motion-prev"><a class="wp-block-button__link wp-element-button" href="#jv-team-slider">←</a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"jv-arrow jv-arrow--next tracy-motion-next"} -->
<div class="wp-block-button jv-arrow jv-arrow--next tracy-motion-next"><a class="wp-block-button__link wp-element-button" href="#jv-team-slider">→</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"anchor":"jv-team-slider","className":"jv-teams__slider tracy-motion-reveal tracy-motion-delay-1","layout":{"type":"default"}} -->
<div class="wp-block-group jv-teams__slider tracy-motion-reveal tracy-motion-delay-1" id="jv-team-slider">
<!-- wp:group {"className":"tracy-motion-carousel jv-carousel acm-teams--cols-4","metadata":{"name":"teams.carousel"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-carousel jv-carousel acm-teams--cols-4">
<!-- wp:group {"className":"tracy-motion-track","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"tracy-motion-slide jv-member","metadata":{"name":"teams.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-slide jv-member">
<!-- wp:image {"sizeSlug":"full","className":"jv-member__photo","metadata":{"role":"content","name":"teams.img.1"}} -->
<figure class="wp-block-image size-full jv-member__photo"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":5,"className":"jv-member__name","metadata":{"role":"content","name":"teams.title.1"}} -->
<h5 class="wp-block-heading jv-member__name"><a href="#"><?php esc_html_e( 'Jennifer Lee', 'wp-ja-vega' ); ?></a></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-member__role","metadata":{"role":"content","name":"teams.team-position.1"}} -->
<p class="jv-member__role"><?php esc_html_e( 'Marketing director', 'wp-ja-vega' ); ?></p>
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
