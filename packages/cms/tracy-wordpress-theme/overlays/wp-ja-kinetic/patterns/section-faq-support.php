<?php
/**
 * Title: FAQ support card
 * Slug: wp-ja-kinetic/section-faq-support
 * Description: Centred card on a banded section: a life-buoy mark, a heading, one line of reassurance and a single button. Every spec section of type `faq-support`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: faq, support, card, contact, help
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"className":"ja-acm acm-faq-support style-1"} -->
<div class="wp-block-group ja-acm acm-faq-support style-1">
<!-- wp:group {"className":"hx-sup-section"} -->
<div class="wp-block-group hx-sup-section">
<!-- wp:group {"className":"hx-sup-inner"} -->
<div class="wp-block-group hx-sup-inner">
<!-- wp:group {"className":"hx-sup-card"} -->
<div class="wp-block-group hx-sup-card">
<!-- wp:heading {"className":"hx-sup-title","metadata":{"role":"content","name":"faq-support.title"}} -->
<h2 class="wp-block-heading hx-sup-title"><?php esc_html_e( 'Still have questions?', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-sup-sub","metadata":{"role":"content","name":"faq-support.sub"}} -->
<p class="hx-sup-sub"><?php esc_html_e( 'Our engineers answer support tickets, not bots. Most replies land within an hour.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"hx-sup-btn","metadata":{"role":"content","name":"faq-support.btn-label"}} -->
<div class="wp-block-button hx-sup-btn"><a class="wp-block-button__link wp-element-button" href="/company/contact"><?php esc_html_e( 'Contact support', 'wp-ja-kinetic' ); ?></a></div>
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
