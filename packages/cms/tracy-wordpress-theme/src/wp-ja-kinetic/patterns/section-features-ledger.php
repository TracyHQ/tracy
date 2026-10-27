<?php
/**
 * Title: Features ledger
 * Slug: wp-ja-kinetic/section-features-ledger
 * Description: Numbered specification rows under a ruled head and a card header: each row carries an index, an icon, a title, a line of copy and a figure. Every spec section of type `features-ledger`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: features, ledger, spec rows, capability, numbered, acm
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-features-ledger style-1 layout-ledger"} -->
<section class="wp-block-group ja-acm acm-features-ledger style-1 layout-ledger">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-fl-ruled"} -->
<div class="wp-block-group hx-fl-ruled">
<!-- wp:group {"className":"hx-fl-ruled-row"} -->
<div class="wp-block-group hx-fl-ruled-row">
<!-- wp:group {"className":"hx-fl-ruled-l"} -->
<div class="wp-block-group hx-fl-ruled-l">
<!-- wp:paragraph {"className":"hx-fl-ruled-idx","metadata":{"role":"content","name":"features-ledger.eyebrow"}} -->
<p class="hx-fl-ruled-idx"><?php esc_html_e( '(01)', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-fl-ruled-title","metadata":{"role":"content","name":"features-ledger.title"}} -->
<p class="hx-fl-ruled-title"><?php esc_html_e( 'Capability', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-fl-ruled-count","metadata":{"role":"content","name":"features-ledger.sub"}} -->
<p class="hx-fl-ruled-count"><?php esc_html_e( '06 MODULES', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-specrows"} -->
<div class="wp-block-group hx-specrows">
<!-- wp:group {"className":"hx-spec-cardhead"} -->
<div class="wp-block-group hx-spec-cardhead">
<!-- wp:paragraph {"className":"hx-spec-cardhead-l","metadata":{"role":"content","name":"features-ledger.card_label"}} -->
<p class="hx-spec-cardhead-l"><?php esc_html_e( 'capability', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-spec-cardhead-r","metadata":{"role":"content","name":"features-ledger.card_badge"}} -->
<p class="hx-spec-cardhead-r"><?php esc_html_e( '// 06 modules', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-specrow","metadata":{"name":"features-ledger.item.1"}} -->
<div class="wp-block-group hx-specrow">
<!-- wp:paragraph {"className":"hx-spec-num","metadata":{"role":"content","name":"features-ledger.number.1"}} -->
<p class="hx-spec-num"><?php esc_html_e( '01', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-main"} -->
<div class="wp-block-group hx-spec-main">
<!-- wp:paragraph {"className":"hx-spec-icon hx-ico-layers","metadata":{"name":"features-ledger.icon.1"}} -->
<p class="hx-spec-icon hx-ico-layers"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-copy"} -->
<div class="wp-block-group hx-spec-copy">
<!-- wp:heading {"level":3,"className":"hx-spec-title","metadata":{"role":"content","name":"features-ledger.item-title.1"}} -->
<h3 class="wp-block-heading hx-spec-title"><?php esc_html_e( 'Unified telemetry', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-spec-text","metadata":{"role":"content","name":"features-ledger.item-text.1"}} -->
<p class="hx-spec-text"><?php esc_html_e( 'Logs, metrics and traces share one schema and one timeline.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-spec-stat"} -->
<div class="wp-block-group hx-spec-stat">
<!-- wp:paragraph {"className":"hx-spec-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.1"}} -->
<p class="hx-spec-stat-val"><?php esc_html_e( '5 min', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-spec-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.1"}} -->
<p class="hx-spec-stat-lab"><?php esc_html_e( 'median', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-specrow","metadata":{"name":"features-ledger.item.2"}} -->
<div class="wp-block-group hx-specrow">
<!-- wp:paragraph {"className":"hx-spec-num","metadata":{"role":"content","name":"features-ledger.number.2"}} -->
<p class="hx-spec-num"><?php esc_html_e( '02', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-main"} -->
<div class="wp-block-group hx-spec-main">
<!-- wp:paragraph {"className":"hx-spec-icon hx-ico-zap","metadata":{"name":"features-ledger.icon.2"}} -->
<p class="hx-spec-icon hx-ico-zap"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-copy"} -->
<div class="wp-block-group hx-spec-copy">
<!-- wp:heading {"level":3,"className":"hx-spec-title","metadata":{"role":"content","name":"features-ledger.item-title.2"}} -->
<h3 class="wp-block-heading hx-spec-title"><?php esc_html_e( 'Sub-second queries', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-spec-text","metadata":{"role":"content","name":"features-ledger.item-text.2"}} -->
<p class="hx-spec-text"><?php esc_html_e( 'A columnar engine scans billions of events in milliseconds.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-spec-stat"} -->
<div class="wp-block-group hx-spec-stat">
<!-- wp:paragraph {"className":"hx-spec-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.2"}} -->
<p class="hx-spec-stat-val"><?php esc_html_e( '60%', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-spec-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.2"}} -->
<p class="hx-spec-stat-lab"><?php esc_html_e( 'less noise', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-specrow","metadata":{"name":"features-ledger.item.3"}} -->
<div class="wp-block-group hx-specrow">
<!-- wp:paragraph {"className":"hx-spec-num","metadata":{"role":"content","name":"features-ledger.number.3"}} -->
<p class="hx-spec-num"><?php esc_html_e( '03', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-main"} -->
<div class="wp-block-group hx-spec-main">
<!-- wp:paragraph {"className":"hx-spec-icon hx-ico-bell","metadata":{"name":"features-ledger.icon.3"}} -->
<p class="hx-spec-icon hx-ico-bell"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-copy"} -->
<div class="wp-block-group hx-spec-copy">
<!-- wp:heading {"level":3,"className":"hx-spec-title","metadata":{"role":"content","name":"features-ledger.item-title.3"}} -->
<h3 class="wp-block-heading hx-spec-title"><?php esc_html_e( 'Smart alerting', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-spec-text","metadata":{"role":"content","name":"features-ledger.item-text.3"}} -->
<p class="hx-spec-text"><?php esc_html_e( 'Anomaly detection that learns your baselines and pages only when it matters.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-spec-stat"} -->
<div class="wp-block-group hx-spec-stat">
<!-- wp:paragraph {"className":"hx-spec-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.3"}} -->
<p class="hx-spec-stat-val"><?php esc_html_e( '100%', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-spec-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.3"}} -->
<p class="hx-spec-stat-lab"><?php esc_html_e( 'outliers', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-specrow","metadata":{"name":"features-ledger.item.4"}} -->
<div class="wp-block-group hx-specrow">
<!-- wp:paragraph {"className":"hx-spec-num","metadata":{"role":"content","name":"features-ledger.number.4"}} -->
<p class="hx-spec-num"><?php esc_html_e( '04', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-main"} -->
<div class="wp-block-group hx-spec-main">
<!-- wp:paragraph {"className":"hx-spec-icon hx-ico-git-branch","metadata":{"name":"features-ledger.icon.4"}} -->
<p class="hx-spec-icon hx-ico-git-branch"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-copy"} -->
<div class="wp-block-group hx-spec-copy">
<!-- wp:heading {"level":3,"className":"hx-spec-title","metadata":{"role":"content","name":"features-ledger.item-title.4"}} -->
<h3 class="wp-block-heading hx-spec-title"><?php esc_html_e( 'Distributed tracing', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-spec-text","metadata":{"role":"content","name":"features-ledger.item-text.4"}} -->
<p class="hx-spec-text"><?php esc_html_e( 'Follow a request from edge to database with full span context.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-spec-stat"} -->
<div class="wp-block-group hx-spec-stat">
<!-- wp:paragraph {"className":"hx-spec-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.4"}} -->
<p class="hx-spec-stat-val"><?php esc_html_e( '<400ms', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-spec-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.4"}} -->
<p class="hx-spec-stat-lab"><?php esc_html_e( 'QUERY LATENCY', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-specrow","metadata":{"name":"features-ledger.item.5"}} -->
<div class="wp-block-group hx-specrow">
<!-- wp:paragraph {"className":"hx-spec-num","metadata":{"role":"content","name":"features-ledger.number.5"}} -->
<p class="hx-spec-num"><?php esc_html_e( '05', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-main"} -->
<div class="wp-block-group hx-spec-main">
<!-- wp:paragraph {"className":"hx-spec-icon hx-ico-database","metadata":{"name":"features-ledger.icon.5"}} -->
<p class="hx-spec-icon hx-ico-database"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-copy"} -->
<div class="wp-block-group hx-spec-copy">
<!-- wp:heading {"level":3,"className":"hx-spec-title","metadata":{"role":"content","name":"features-ledger.item-title.5"}} -->
<h3 class="wp-block-heading hx-spec-title"><?php esc_html_e( 'Tiered retention', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-spec-text","metadata":{"role":"content","name":"features-ledger.item-text.5"}} -->
<p class="hx-spec-text"><?php esc_html_e( 'Hot for 30 days, warm for a year. Pay for what you query.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-spec-stat"} -->
<div class="wp-block-group hx-spec-stat">
<!-- wp:paragraph {"className":"hx-spec-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.5"}} -->
<p class="hx-spec-stat-val"><?php esc_html_e( '99.99%', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-spec-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.5"}} -->
<p class="hx-spec-stat-lab"><?php esc_html_e( 'AVAILABILITY', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-specrow","metadata":{"name":"features-ledger.item.6"}} -->
<div class="wp-block-group hx-specrow">
<!-- wp:paragraph {"className":"hx-spec-num","metadata":{"role":"content","name":"features-ledger.number.6"}} -->
<p class="hx-spec-num"><?php esc_html_e( '06', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-main"} -->
<div class="wp-block-group hx-spec-main">
<!-- wp:paragraph {"className":"hx-spec-icon hx-ico-shield","metadata":{"name":"features-ledger.icon.6"}} -->
<p class="hx-spec-icon hx-ico-shield"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-spec-copy"} -->
<div class="wp-block-group hx-spec-copy">
<!-- wp:heading {"level":3,"className":"hx-spec-title","metadata":{"role":"content","name":"features-ledger.item-title.6"}} -->
<h3 class="wp-block-heading hx-spec-title"><?php esc_html_e( 'SOC 2 & SSO', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-spec-text","metadata":{"role":"content","name":"features-ledger.item-text.6"}} -->
<p class="hx-spec-text"><?php esc_html_e( 'SAML, SCIM, audit logs and field-level redaction from day one.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-spec-stat"} -->
<div class="wp-block-group hx-spec-stat">
<!-- wp:paragraph {"className":"hx-spec-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.6"}} -->
<p class="hx-spec-stat-val"><?php esc_html_e( '4,000+', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-spec-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.6"}} -->
<p class="hx-spec-stat-lab"><?php esc_html_e( 'TEAMS', 'wp-ja-kinetic' ); ?></p>
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
