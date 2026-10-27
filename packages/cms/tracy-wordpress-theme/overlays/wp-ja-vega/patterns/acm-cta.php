<?php
/**
 * Title: Call to action panel
 * Slug: wp-ja-vega/section-cta
 * Description: A rounded panel on a background picture (Joomla ACM `cta` style-1): a small label, a large line and an optional button, centred.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: call to action, cta, banner, contact, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-cta-sec","metadata":{"name":"cta.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-cta-sec">
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-cta tracy-motion-reveal","layout":{"type":"default"}} -->
<div class="wp-block-group jv-cta tracy-motion-reveal">
<!-- wp:image {"sizeSlug":"full","className":"jv-bg","metadata":{"role":"content","name":"cta.cta-bg"}} -->
<figure class="wp-block-image size-full jv-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jv-cta__content","layout":{"type":"default"}} -->
<div class="wp-block-group jv-cta__content">
<!-- wp:paragraph {"className":"jv-eyebrow","metadata":{"role":"content","name":"cta.cta-title"}} -->
<p class="jv-eyebrow"><?php esc_html_e( 'Get started now', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-cta__line","metadata":{"role":"content","name":"cta.cta-desc"}} -->
<p class="jv-cta__line"><?php esc_html_e( 'Ready to talk about your next project?', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jv-actions jv-actions--center"} -->
<div class="wp-block-buttons jv-actions jv-actions--center">
<!-- wp:button {"className":"jv-btn jv-btn--light jv-btn--arrow","metadata":{"role":"content","name":"cta.item.1"}} -->
<div class="wp-block-button jv-btn jv-btn--light jv-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Schedule a call', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
