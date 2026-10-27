<?php
/**
 * Title: Features ledger, stats
 * Slug: wp-ja-kinetic/section-features-ledger-stats
 * Description: A three-up card grid under an optional eyebrow/heading: each card leads with a large figure and a mono label, then an icon and a title, then a line of copy. Every spec section of type `features-ledger` drawn in layout `stats` — also the layout the source falls back to when a section carries no `layout` value at all.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: features, ledger, stats, cards, capability, acm
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-features-ledger style-1 layout-stats"} -->
<section class="wp-block-group ja-acm acm-features-ledger style-1 layout-stats">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-fl-head"} -->
<div class="wp-block-group hx-fl-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"features-ledger.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '// why kinetic', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"hx-h2","metadata":{"role":"content","name":"features-ledger.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'Built for the pager', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-fl-sub","metadata":{"role":"content","name":"features-ledger.sub"}} -->
<p class="hx-fl-sub"><?php esc_html_e( 'The numbers on-call engineers actually look at.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-stats"} -->
<div class="wp-block-group hx-stats">
<!-- wp:group {"className":"hx-stat","metadata":{"name":"features-ledger.item.1"}} -->
<div class="wp-block-group hx-stat">
<!-- wp:paragraph {"className":"hx-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.1"}} -->
<p class="hx-stat-val"><?php esc_html_e( '5 min', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.1"}} -->
<p class="hx-stat-lab"><?php esc_html_e( 'median', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-stat-head"} -->
<div class="wp-block-group hx-stat-head">
<!-- wp:paragraph {"className":"hx-stat-icon hx-ico-clock","metadata":{"name":"features-ledger.icon.1"}} -->
<p class="hx-stat-icon hx-ico-clock"></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"hx-stat-title","metadata":{"role":"content","name":"features-ledger.item-title.1"}} -->
<h3 class="wp-block-heading hx-stat-title"><?php esc_html_e( 'Five-minute MTTR', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-stat-text","metadata":{"role":"content","name":"features-ledger.item-text.1"}} -->
<p class="hx-stat-text"><?php esc_html_e( 'From alert to evidence in one click.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-stat","metadata":{"name":"features-ledger.item.2"}} -->
<div class="wp-block-group hx-stat">
<!-- wp:paragraph {"className":"hx-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.2"}} -->
<p class="hx-stat-val"><?php esc_html_e( '60%', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.2"}} -->
<p class="hx-stat-lab"><?php esc_html_e( 'less noise', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-stat-head"} -->
<div class="wp-block-group hx-stat-head">
<!-- wp:paragraph {"className":"hx-stat-icon hx-ico-bell","metadata":{"name":"features-ledger.icon.2"}} -->
<p class="hx-stat-icon hx-ico-bell"></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"hx-stat-title","metadata":{"role":"content","name":"features-ledger.item-title.2"}} -->
<h3 class="wp-block-heading hx-stat-title"><?php esc_html_e( 'Quieter pager', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-stat-text","metadata":{"role":"content","name":"features-ledger.item-text.2"}} -->
<p class="hx-stat-text"><?php esc_html_e( 'Suppress the predictable.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-stat","metadata":{"name":"features-ledger.item.3"}} -->
<div class="wp-block-group hx-stat">
<!-- wp:paragraph {"className":"hx-stat-val","metadata":{"role":"content","name":"features-ledger.stat_value.3"}} -->
<p class="hx-stat-val"><?php esc_html_e( '100%', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-stat-lab","metadata":{"role":"content","name":"features-ledger.stat_label.3"}} -->
<p class="hx-stat-lab"><?php esc_html_e( 'outliers', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-stat-head"} -->
<div class="wp-block-group hx-stat-head">
<!-- wp:paragraph {"className":"hx-stat-icon hx-ico-layers","metadata":{"name":"features-ledger.icon.3"}} -->
<p class="hx-stat-icon hx-ico-layers"></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"hx-stat-title","metadata":{"role":"content","name":"features-ledger.item-title.3"}} -->
<h3 class="wp-block-heading hx-stat-title"><?php esc_html_e( 'Tail sampling', 'wp-ja-kinetic' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-stat-text","metadata":{"role":"content","name":"features-ledger.item-text.3"}} -->
<p class="hx-stat-text"><?php esc_html_e( 'Keep the traces that matter.', 'wp-ja-kinetic' ); ?></p>
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
