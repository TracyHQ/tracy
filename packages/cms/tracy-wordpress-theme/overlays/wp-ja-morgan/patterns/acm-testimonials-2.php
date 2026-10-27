<?php
/**
 * Title: Quote
 * Slug: wp-ja-morgan/acm-testimonials-2
 * Description: One quote at a time with the speaker portrait, name and role, stepped with dots (Joomla ACM `testimonials` style-2 of JA Morgan, drawn above the footer).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: testimonial, quote, carousel, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm t3-section-footer","metadata":{"name":"testimonials.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm t3-section-footer">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"acm-testimonial style-2 tracy-motion-carousel tracy-motion-carousel--dots","layout":{"type":"default"}} -->
<div class="wp-block-group acm-testimonial style-2 tracy-motion-carousel tracy-motion-carousel--dots">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"testimonials.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"testimonial-item","metadata":{"name":"testimonials.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-item">
<!-- wp:image {"sizeSlug":"full","className":"testimonial-avatar","metadata":{"role":"content","name":"testimonials.avatar.1"}} -->
<figure class="wp-block-image size-full testimonial-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"testimonial-content-wrap","layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-content-wrap">
<!-- wp:paragraph {"className":"testimonial-content","metadata":{"role":"content","name":"testimonials.content.1"}} -->
<p class="testimonial-content"><?php esc_html_e( 'A quote of one or two lines.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"testimonial-detail","metadata":{"role":"content","name":"testimonials.name.1"}} -->
<p class="testimonial-detail"><?php esc_html_e( 'A name', 'wp-ja-morgan' ); ?></p>
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
