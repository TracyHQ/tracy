<?php
/**
 * Title: Bento grid, incident layout
 * Slug: wp-ja-kinetic/section-bento-style-2
 * Description: Four-column editorial grid under a hairline rule: a tall featured tile with a telemetry chart, a wide stat tile with a sparkline, two small capability tiles and two half-row tiles. Every spec section of type `bento` drawn in style 2.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: bento, grid, features, stat, sparkline, incident, tiles
 *
 * The source picks each tile's markup from its content (acm/bento/tmpl/style-2.php:71-80,
 * 102-140): a tile with a stat is `span-wide is-stat` (stat column + spark, no icon or title),
 * span `feat` is `span-feat is-feat` (icon, title, text, chart image), span `wide` is
 * `span-wide is-half` and anything else `span-1 is-small` (icon + `.acm-bento-body`). The four
 * kinds differ in nesting, so no single tile can be cloned into the others: the six tiles are drawn
 * here in the one order the source instance uses, and the tile groups carry no `bento.item.<n>`
 * name, so a filler fills each tile's own named fields in place instead of cloning one tile over
 * all six. The icon SVGs and the stat spark are added at render time
 * (inc/extra.php, wp_ja_kinetic_bento_style2_svg): the icon key rides on an `is-ico-<key>` class.
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"className":"ja-acm acm-bento style-2"} -->
<div class="wp-block-group ja-acm acm-bento style-2">
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
<p class="acm-bento-eyebrow"><?php esc_html_e( '(01) / what you get', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"acm-bento-title","metadata":{"role":"content","name":"bento.title"}} -->
<h2 class="wp-block-heading acm-bento-title"><?php esc_html_e( 'One platform for every signal', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"acm-bento-sub","metadata":{"role":"content","name":"bento.sub"}} -->
<p class="acm-bento-sub"><?php esc_html_e( 'Stop stitching together five tools. Kinetic ingests, correlates and alerts on your entire stack from a single, fast pipeline.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-bento acm-bento-grid"} -->
<div class="wp-block-group hx-bento acm-bento-grid">
<!-- wp:group {"className":"hx-card acm-bento-tile span-feat is-feat"} -->
<div class="wp-block-group hx-card acm-bento-tile span-feat is-feat">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-git-merge","metadata":{"name":"bento.tile-icon.1"}} -->
<p class="acm-bento-ico is-ico-git-merge"></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.1"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'Unified telemetry, one timeline', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.1"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'Logs, metrics and traces share one schema and one clock. Line them up on a single timeline and the correlation that used to take four tabs is just there.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:image {"className":"acm-bento-media","metadata":{"role":"content","name":"bento.tile-image.1"}} -->
<figure class="wp-block-image acm-bento-media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Unified telemetry, one timeline', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card acm-bento-tile span-wide is-stat"} -->
<div class="wp-block-group hx-card acm-bento-tile span-wide is-stat">
<!-- wp:group {"className":"acm-bento-stat-main"} -->
<div class="wp-block-group acm-bento-stat-main">
<!-- wp:paragraph {"className":"acm-bento-stat-eyebrow","metadata":{"role":"content","name":"bento.tile-eyebrow.2"}} -->
<p class="acm-bento-stat-eyebrow"><?php esc_html_e( 'SUB-SECOND QUERIES', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-bento-stat-row"} -->
<div class="wp-block-group acm-bento-stat-row">
<!-- wp:paragraph {"className":"acm-bento-stat-val","metadata":{"role":"content","name":"bento.tile-stat.2"}} -->
<p class="acm-bento-stat-val"><?php esc_html_e( '<400', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-bento-stat-unit","metadata":{"role":"content","name":"bento.tile-unit.2"}} -->
<p class="acm-bento-stat-unit"><?php esc_html_e( 'ms', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.2"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'p95 query latency scanning 10 billion events. Ask a question, get the answer before you blink.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-bento-spark"} -->
<div class="wp-block-group acm-bento-spark">
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card acm-bento-tile span-1 is-small"} -->
<div class="wp-block-group hx-card acm-bento-tile span-1 is-small">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-bell","metadata":{"name":"bento.tile-icon.3"}} -->
<p class="acm-bento-ico is-ico-bell"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-bento-body"} -->
<div class="wp-block-group acm-bento-body">
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.3"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'Smart alerting', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.3"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'Baselines that learn. Page only when it matters.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card acm-bento-tile span-1 is-small"} -->
<div class="wp-block-group hx-card acm-bento-tile span-1 is-small">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-git-branch","metadata":{"name":"bento.tile-icon.4"}} -->
<p class="acm-bento-ico is-ico-git-branch"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-bento-body"} -->
<div class="wp-block-group acm-bento-body">
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.4"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'Distributed tracing', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.4"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'Edge to database, with flame graphs and span context.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card acm-bento-tile span-wide is-half"} -->
<div class="wp-block-group hx-card acm-bento-tile span-wide is-half">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-database","metadata":{"name":"bento.tile-icon.5"}} -->
<p class="acm-bento-ico is-ico-database"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-bento-body"} -->
<div class="wp-block-group acm-bento-body">
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.5"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'Tiered retention', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.5"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'Hot for 30 days, warm for a year. Pay for what you query, not what you hoard.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card acm-bento-tile span-wide is-half"} -->
<div class="wp-block-group hx-card acm-bento-tile span-wide is-half">
<!-- wp:paragraph {"className":"acm-bento-ico is-ico-shield","metadata":{"name":"bento.tile-icon.6"}} -->
<p class="acm-bento-ico is-ico-shield"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-bento-body"} -->
<div class="wp-block-group acm-bento-body">
<!-- wp:heading {"level":3,"className":"acm-bento-tile-title","metadata":{"role":"content","name":"bento.tile-title.6"}} -->
<h3 class="wp-block-heading acm-bento-tile-title"><?php esc_html_e( 'SOC 2 & SSO', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-bento-tile-text","metadata":{"role":"content","name":"bento.tile-text.6"}} -->
<p class="acm-bento-tile-text"><?php esc_html_e( 'SAML, SCIM, audit logs and field-level redaction from day one, every plan.', 'wp-ja-kinetic' ); ?></p>
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
</div>
<!-- /wp:group -->
