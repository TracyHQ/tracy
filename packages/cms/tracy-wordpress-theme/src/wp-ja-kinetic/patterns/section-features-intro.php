<?php
/**
 * Title: Features intro
 * Slug: wp-ja-kinetic/section-features-intro
 * Description: A borderless three-up grid of icon-led cards under an eyebrow and a heading; each card may close with a monospaced figure. Every spec section of type `features-intro`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: features, intro, grid, cards, icons, signals, acm
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-features-intro style-1"} -->
<section class="wp-block-group ja-acm acm-features-intro style-1">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-fi-head"} -->
<div class="wp-block-group hx-fi-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"features-intro.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '(02) / THE THREE SIGNALS', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"hx-h2","metadata":{"role":"content","name":"features-intro.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'Built for logs, metrics and traces — together', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-cols hx-fi-grid hx-cols-3","metadata":{"name":"features-intro.columns"}} -->
<div class="wp-block-group hx-cols hx-fi-grid hx-cols-3">
<!-- wp:group {"className":"hx-feat","metadata":{"name":"features-intro.item.1"}} -->
<div class="wp-block-group hx-feat">
<!-- wp:group {"className":"hx-feat-icon hx-ico-server","metadata":{"name":"features-intro.icon.1"}} -->
<div class="wp-block-group hx-feat-icon hx-ico-server"></div>
<!-- /wp:group -->
<!-- wp:heading {"level":3,"className":"hx-feat-title","metadata":{"role":"content","name":"features-intro.item-title.1"}} -->
<h3 class="wp-block-heading hx-feat-title"><?php esc_html_e( 'Logs', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-feat-text","metadata":{"role":"content","name":"features-intro.item-text.1"}} -->
<p class="hx-feat-text"><?php esc_html_e( 'Structured, full-text and JSON logs with instant filtering.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-feat-stat","metadata":{"role":"content","name":"features-intro.stat.1"}} -->
<p class="hx-feat-stat"><?php esc_html_e( '// 1.2M events/min ingest', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-feat","metadata":{"name":"features-intro.item.2"}} -->
<div class="wp-block-group hx-feat">
<!-- wp:group {"className":"hx-feat-icon hx-ico-activity","metadata":{"name":"features-intro.icon.2"}} -->
<div class="wp-block-group hx-feat-icon hx-ico-activity"></div>
<!-- /wp:group -->
<!-- wp:heading {"level":3,"className":"hx-feat-title","metadata":{"role":"content","name":"features-intro.item-title.2"}} -->
<h3 class="wp-block-heading hx-feat-title"><?php esc_html_e( 'Metrics', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-feat-text","metadata":{"role":"content","name":"features-intro.item-text.2"}} -->
<p class="hx-feat-text"><?php esc_html_e( 'High-cardinality metrics with no pre-aggregation tax.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-feat-stat","metadata":{"role":"content","name":"features-intro.stat.2"}} -->
<p class="hx-feat-stat"><?php esc_html_e( '// 13-month retention', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-feat","metadata":{"name":"features-intro.item.3"}} -->
<div class="wp-block-group hx-feat">
<!-- wp:group {"className":"hx-feat-icon hx-ico-git-branch","metadata":{"name":"features-intro.icon.3"}} -->
<div class="wp-block-group hx-feat-icon hx-ico-git-branch"></div>
<!-- /wp:group -->
<!-- wp:heading {"level":3,"className":"hx-feat-title","metadata":{"role":"content","name":"features-intro.item-title.3"}} -->
<h3 class="wp-block-heading hx-feat-title"><?php esc_html_e( 'Traces', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-feat-text","metadata":{"role":"content","name":"features-intro.item-text.3"}} -->
<p class="hx-feat-text"><?php esc_html_e( 'Tail-based sampling keeps the traces that actually matter.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-feat-stat","metadata":{"role":"content","name":"features-intro.stat.3"}} -->
<p class="hx-feat-stat"><?php esc_html_e( '// 100% tail sampling', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-feat","metadata":{"name":"features-intro.item.4"}} -->
<div class="wp-block-group hx-feat">
<!-- wp:group {"className":"hx-feat-icon hx-ico-shield","metadata":{"name":"features-intro.icon.4"}} -->
<div class="wp-block-group hx-feat-icon hx-ico-shield"></div>
<!-- /wp:group -->
<!-- wp:heading {"level":3,"className":"hx-feat-title","metadata":{"role":"content","name":"features-intro.item-title.4"}} -->
<h3 class="wp-block-heading hx-feat-title"><?php esc_html_e( 'Secure by default', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-feat-text","metadata":{"role":"content","name":"features-intro.item-text.4"}} -->
<p class="hx-feat-text"><?php esc_html_e( 'SSO, audit logs and field-level redaction ship on day one.', 'wp-ja-kinetic' ); ?></p>
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
