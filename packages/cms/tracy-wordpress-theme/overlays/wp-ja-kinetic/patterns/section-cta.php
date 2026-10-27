<?php
/**
 * Title: Call to action
 * Slug: wp-ja-kinetic/section-cta
 * Description: Centered themed card: mono eyebrow, display heading, intro, then a primary button, a terminal-style code chip and an outline button. Every spec section of type `cta`. The `card` variant is drawn here; a `band` or `bar` section is the same markup with `cta-card` swapped on the outer group.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: cta, call to action, card, band, conversion
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"className":"ja-acm acm-cta style-1 cta-card","metadata":{"name":"cta"}} -->
<div class="wp-block-group ja-acm acm-cta style-1 cta-card">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container"} -->
<div class="wp-block-group hx-container">
<!-- wp:group {"className":"hx-cta-inner"} -->
<div class="wp-block-group hx-cta-inner">
<!-- wp:paragraph {"className":"hx-cta-eyebrow","metadata":{"role":"content","name":"cta.eyebrow"}} -->
<p class="hx-cta-eyebrow"><?php esc_html_e( '// get started in minutes', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"hx-cta-title","metadata":{"role":"content","name":"cta.title"}} -->
<h2 class="wp-block-heading hx-cta-title"><?php esc_html_e( 'Your next incident is coming. Be ready for it.', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-cta-sub","metadata":{"role":"content","name":"cta.sub"}} -->
<p class="hx-cta-sub"><?php esc_html_e( 'Free for 14 days. No credit card. Pipe your first logs in under five minutes.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"hx-cta-actions"} -->
<div class="wp-block-buttons hx-cta-actions">
<!-- wp:button {"className":"hx-cta-btn hx-cta-btn-primary","metadata":{"role":"content","name":"cta.btn1"}} -->
<div class="wp-block-button hx-cta-btn hx-cta-btn-primary"><a class="wp-block-button__link wp-element-button" href="/pages/register"><?php esc_html_e( 'Start free', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"hx-cta-chip","metadata":{"role":"content","name":"cta.chip"}} -->
<div class="wp-block-button hx-cta-chip"><a class="wp-block-button__link wp-element-button" href="/pages/register"><?php esc_html_e( 'kinetic init', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"hx-cta-btn hx-cta-btn-ghost","metadata":{"role":"content","name":"cta.btn2"}} -->
<div class="wp-block-button hx-cta-btn hx-cta-btn-ghost"><a class="wp-block-button__link wp-element-button" href="/company/contact"><?php esc_html_e( 'Talk to sales', 'wp-ja-kinetic' ); ?></a></div>
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
