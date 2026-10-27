<?php
/**
 * Title: Call to action
 * Slug: wp-tracy-business/section-cta
 * Description: Green accent band: heading and intro on the left, an orange button (and an optional outline one) on the right. Every spec section of type `cta`. Items of a cta section are its own button labels again and are not carried.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: cta, call to action, band, quote
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-cta"} -->
<section class="wp-block-group wtb-section wtb-cta">
<!-- wp:group {"className":"wtb-inner wtb-cta__inner"} -->
<div class="wp-block-group wtb-inner wtb-cta__inner">
<!-- wp:group {"className":"wtb-cta__copy"} -->
<div class="wp-block-group wtb-cta__copy">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"cta.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Next step', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"wtb-heading","metadata":{"role":"content","name":"cta.heading"}} -->
<h2 class="wp-block-heading wtb-heading"><?php esc_html_e( 'Need a budget estimate for an upcoming build?', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"cta.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'Send us concept drawings and we return a preliminary quantity take-off within five working days.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"wtb-actions wtb-cta__actions"} -->
<div class="wp-block-buttons wtb-actions wtb-cta__actions">
<!-- wp:button {"className":"is-style-orange","metadata":{"role":"content","name":"cta.cta.1"}} -->
<div class="wp-block-button is-style-orange"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Talk to our sales team', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline","metadata":{"role":"content","name":"cta.cta.2"}} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'See projects', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
