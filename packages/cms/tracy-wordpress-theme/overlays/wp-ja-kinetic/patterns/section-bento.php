<?php
/**
 * Title: Bento grid
 * Slug: wp-ja-kinetic/section-bento
 * Description: Capability grid under a hairline rule: eyebrow and heading on the left, subheading on the right, then bordered tiles carrying an accent icon chip, a title and a line of copy, one tile twice as tall as the rest. Every spec section of type `bento` drawn in style 1.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: bento, grid, features, capabilities, tiles
 *
 * The source tile is `span-2` (tall) or `span-1` by its `tile-span` field and carries the
 * `tile-icon` key's inline SVG (acm/bento/tmpl/style-1.php:54-76). A cloned tile keeps the one
 * template tile's span and icon classes, so the three tiles are drawn here in the one order the
 * source instance uses (span-2 activity, span-1 search, span-1 zap) and the tile groups carry no
 * `bento.item.<n>` name: a filler fills each tile's own named fields in place instead of cloning
 * one tile over all three. The icon SVGs are added at render time
 * (inc/extra.php, wp_ja_kinetic_bento_style2_svg): the icon key rides on an `is-ico-<key>` class.
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"className":"ja-acm acm-bento style-1"} -->
<div class="wp-block-group ja-acm acm-bento style-1">
<!-- wp:group {"tagName":"section","className":"hx-section hx-pad"} -->
<section class="wp-block-group hx-section hx-pad">
<!-- wp:group {"className":"hx-container"} -->
<div class="wp-block-group hx-container">
<!-- wp:group {"className":"acm-bento-rule"} -->
<div class="wp-block-group acm-bento-rule">
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-bento-head"} -->
<div class="wp-block-group acm-bento-head">
<!-- wp:group {"className":"acm-bento-head-main"} -->
<div class="wp-block-group acm-bento-head-main">
<!-- wp:paragraph {"className":"acm-bento-eyebrow","metadata":{"role":"content","name":"bento.eyebrow"}} -->
<p class="acm-bento-eyebrow"><?php esc_html_e( '// the platform', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"acm-bento-title","metadata":{"role":"content","name":"bento.title"}} -->
<h2 class="wp-block-heading acm-bento-title"><?php esc_html_e( 'Everything in one place', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"acm-bento-sub","metadata":{"role":"content","name":"bento.sub"}} -->
<p class="acm-bento-sub"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-bento acm-bento-grid"} -->
<div class="wp-block-group hx-bento acm-bento-grid">
<!-- wp:group {"className":"hx-card acm-bento-tile span-2"} -->
<div class="wp-block-group hx-card acm-bento-tile span-2">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-activity","metadata":{"name":"bento.tile-icon.1"}} -->
<p class="acm-bento-ico is-ico-activity"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-bento-stat","metadata":{"role":"content","name":"bento.tile-stat.1"}} -->
<p class="acm-bento-stat"></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.1"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'Unified telemetry', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.1"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'Metrics, logs, and traces in one store.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card acm-bento-tile span-1"} -->
<div class="wp-block-group hx-card acm-bento-tile span-1">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-search","metadata":{"name":"bento.tile-icon.2"}} -->
<p class="acm-bento-ico is-ico-search"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-bento-stat","metadata":{"role":"content","name":"bento.tile-stat.2"}} -->
<p class="acm-bento-stat"></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.2"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'KineticQL', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.2"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'Query everything in four lines.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card acm-bento-tile span-1"} -->
<div class="wp-block-group hx-card acm-bento-tile span-1">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-zap","metadata":{"name":"bento.tile-icon.3"}} -->
<p class="acm-bento-ico is-ico-zap"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-bento-stat","metadata":{"role":"content","name":"bento.tile-stat.3"}} -->
<p class="acm-bento-stat"></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.3"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'Smart routing', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.3"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'Page the owner, not the channel.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
