<?php
/**
 * Title: One large quote at a time
 * Slug: wp-ja-fresco/acm-testimonials-1
 * Description: A centred quote in large display type with its author in small accent capitals under it; arrows on either side step through the quotes (Joomla ACM `testimonials` style-1 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: testimonials, quotes, reviews, carousel, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-testimonial style-1","metadata":{"name":"testimonials.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-testimonial style-1">
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"testimonial-carousel tracy-motion-carousel tracy-motion-carousel--nav","metadata":{"name":"testimonials.carousel"},"layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-carousel tracy-motion-carousel tracy-motion-carousel--nav">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"testimonials.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"testimonial-item","metadata":{"name":"testimonials.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-item">
<!-- wp:paragraph {"className":"testimonial-desc","metadata":{"role":"content","name":"testimonials.desc.1"}} -->
<p class="testimonial-desc"><?php esc_html_e( '“A guest says what the evening was like, in two or three lines.”', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"testimonial-author","metadata":{"role":"content","name":"testimonials.author.1"}} -->
<p class="testimonial-author"><?php esc_html_e( 'A guest, the year', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
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
