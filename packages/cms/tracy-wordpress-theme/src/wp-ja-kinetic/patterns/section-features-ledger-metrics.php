<?php
/**
 * Title: Features ledger, metrics
 * Slug: wp-ja-kinetic/section-features-ledger-metrics
 * Description: A bordered metrics card under an optional eyebrow/heading: a label-and-live-badge head bar over a row of borderless stat columns, each a mono label, a large figure and a line of copy. Every spec section of type `features-ledger` drawn in layout `metrics`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: features, ledger, metrics, stats card, capability, acm
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-features-ledger style-1 layout-metrics"} -->
<section class="wp-block-group ja-acm acm-features-ledger style-1 layout-metrics">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-fl-head"} -->
<div class="wp-block-group hx-fl-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"features-ledger.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '(03) / IN PRODUCTION', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"hx-h2","metadata":{"role":"content","name":"features-ledger.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'Live in production', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-fl-sub","metadata":{"role":"content","name":"features-ledger.sub"}} -->
<p class="hx-fl-sub"><?php esc_html_e( 'Real numbers pulled from the last 90 days of production traffic.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-metrics-card"} -->
<div class="wp-block-group hx-metrics-card">
<!-- wp:group {"className":"hx-metrics-head"} -->
<div class="wp-block-group hx-metrics-head">
<!-- wp:paragraph {"className":"hx-metrics-cardlabel","metadata":{"role":"content","name":"features-ledger.card_label"}} -->
<p class="hx-metrics-cardlabel"><?php esc_html_e( 'KINETIC · PRODUCTION METRICS', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-metrics-badge"} -->
<div class="wp-block-group hx-metrics-badge">
<!-- wp:paragraph {"className":"hx-metrics-dot"} -->
<p class="hx-metrics-dot" aria-hidden="true"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"metadata":{"role":"content","name":"features-ledger.card_badge"}} -->
<p><?php esc_html_e( 'LIVE', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-metrics-row"} -->
<div class="wp-block-group hx-metrics-row">
<!-- wp:group {"className":"hx-metric-col","metadata":{"name":"features-ledger.item.1"}} -->
<div class="wp-block-group hx-metric-col">
<!-- wp:paragraph {"className":"hx-metric-label","metadata":{"role":"content","name":"features-ledger.stat_label.1"}} -->
<p class="hx-metric-label"><?php esc_html_e( 'QUERY LATENCY', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-value","metadata":{"role":"content","name":"features-ledger.stat_value.1"}} -->
<p class="hx-metric-value"><?php esc_html_e( '<400ms', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-desc","metadata":{"role":"content","name":"features-ledger.item-text.1"}} -->
<p class="hx-metric-desc"><?php esc_html_e( 'p95 query latency at 10B events', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-metric-col","metadata":{"name":"features-ledger.item.2"}} -->
<div class="wp-block-group hx-metric-col">
<!-- wp:paragraph {"className":"hx-metric-label","metadata":{"role":"content","name":"features-ledger.stat_label.2"}} -->
<p class="hx-metric-label"><?php esc_html_e( 'AVAILABILITY', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-value","metadata":{"role":"content","name":"features-ledger.stat_value.2"}} -->
<p class="hx-metric-value"><?php esc_html_e( '99.99%', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-desc","metadata":{"role":"content","name":"features-ledger.item-text.2"}} -->
<p class="hx-metric-desc"><?php esc_html_e( 'ingestion uptime SLA', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-metric-col","metadata":{"name":"features-ledger.item.3"}} -->
<div class="wp-block-group hx-metric-col">
<!-- wp:paragraph {"className":"hx-metric-label","metadata":{"role":"content","name":"features-ledger.stat_label.3"}} -->
<p class="hx-metric-label"><?php esc_html_e( 'TEAMS', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-value","metadata":{"role":"content","name":"features-ledger.stat_value.3"}} -->
<p class="hx-metric-value"><?php esc_html_e( '4,000+', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-desc","metadata":{"role":"content","name":"features-ledger.item-text.3"}} -->
<p class="hx-metric-desc"><?php esc_html_e( 'engineering teams onboard', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-metric-col","metadata":{"name":"features-ledger.item.4"}} -->
<div class="wp-block-group hx-metric-col">
<!-- wp:paragraph {"className":"hx-metric-label","metadata":{"role":"content","name":"features-ledger.stat_label.4"}} -->
<p class="hx-metric-label"><?php esc_html_e( 'COST DELTA', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-value","metadata":{"role":"content","name":"features-ledger.stat_value.4"}} -->
<p class="hx-metric-value"><?php esc_html_e( '62%', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-metric-desc","metadata":{"role":"content","name":"features-ledger.item-text.4"}} -->
<p class="hx-metric-desc"><?php esc_html_e( 'lower cost vs. legacy APM', 'wp-ja-kinetic' ); ?></p>
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
