<?php
/**
 * Title: Text banner
 * Slug: wp-ja-restaurant/acm-text-banner-default
 * Description: A centred large line and a short text over the page's photo band (the source's custom HTML module "[Chefs] More Info" of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: banner, text, intro, custom
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"text-banner.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"mod-custom custom","layout":{"type":"default"}} -->
<div class="wp-block-group mod-custom custom">
<!-- wp:group {"className":"container text-center","layout":{"type":"default"}} -->
<div class="wp-block-group container text-center">
<!-- wp:heading {"level":2,"className":"text-lead h1","metadata":{"role":"content","name":"text-banner.heading"}} -->
<h2 class="wp-block-heading text-lead h1"><?php esc_html_e( 'A large line', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-banner-text","metadata":{"role":"content","name":"text-banner.text"}} -->
<p class="text-banner-text"><?php esc_html_e( 'A short text under it.', 'wp-ja-restaurant' ); ?></p>
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
