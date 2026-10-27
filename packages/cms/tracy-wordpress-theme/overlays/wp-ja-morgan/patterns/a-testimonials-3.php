<?php
/**
 * Title: Quote cards
 * Slug: wp-ja-morgan/a-testimonials-3
 * Description: A centred title over a stepped row of quote cards, each with a round photo, a name and a role (Joomla ACM testimonials style-3 of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: acm, quotes
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"testimonials.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"testimonials.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"acm-testimonial style-3 align-center","layout":{"type":"default"}} -->
<div class="wp-block-group acm-testimonial style-3 align-center">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"testimonials.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Testimonials.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jm-module-title","metadata":{"role":"content","name":"testimonials.module-title"}} -->
<h3 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A section title', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"testimonial-content tracy-motion-carousel tracy-motion-carousel--dots","layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-content tracy-motion-carousel tracy-motion-carousel--dots">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"testimonials.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"testimonial-item","metadata":{"name":"testimonials.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-item">
<!-- wp:paragraph {"className":"lead-desc","metadata":{"role":"content","name":"testimonials.member-description.1"}} -->
<p class="lead-desc"><?php esc_html_e( 'A short quote.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:image {"sizeSlug":"full","className":"testimonial-img","metadata":{"role":"content","name":"testimonials.img.1"}} -->
<figure class="wp-block-image size-full testimonial-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":5,"className":"testimonial-name","metadata":{"role":"content","name":"testimonials.name.1"}} -->
<h5 class="wp-block-heading testimonial-name"><?php esc_html_e( 'A name', 'wp-ja-morgan' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"testimonial-position","metadata":{"role":"content","name":"testimonials.member-position.1"}} -->
<p class="testimonial-position"><?php esc_html_e( 'A role', 'wp-ja-morgan' ); ?></p>
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
