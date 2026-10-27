<?php
/**
 * Title: Numbered cards
 * Slug: wp-ja-impact/acm-features-5
 * Description: A grid of numbered cards, each with a tag, a title, a text and a button, white or coloured, in one to three columns (ACM features style-5 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, cards, numbered, give, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm ja-acm acm-features style-5 text-start cols-2 has-count","metadata":{"name":"features.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm ja-acm acm-features style-5 text-start cols-2 has-count">
<!-- wp:group {"className":"feature-grid","layout":{"type":"default"}} -->
<div class="wp-block-group feature-grid">
<!-- wp:group {"className":"item bg-white","metadata":{"name":"features.item.1"},"layout":{"type":"default"}} -->
<?php /* ds-keep: bg-white is a marker class the card rules test (:not(.bg-white)); the card ground is --jim-raised, which reads --ds-c-bg */ ?><div class="wp-block-group item bg-white">
<!-- wp:heading {"level":1,"className":"count-number","metadata":{"role":"content","name":"features.count-number.1"}} -->
<h1 class="wp-block-heading count-number"><?php esc_html_e( '01', 'wp-ja-impact' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:group {"className":"feature-content","layout":{"type":"default"}} -->
<div class="wp-block-group feature-content">
<!-- wp:heading {"level":6,"className":"feature-tag","metadata":{"role":"content","name":"features.feature-tag.1"}} -->
<h6 class="wp-block-heading feature-tag"><?php esc_html_e( 'Give money', 'wp-ja-impact' ); ?></h6>
<!-- /wp:heading -->
<!-- wp:heading {"level":3,"className":"feature-title","metadata":{"role":"content","name":"features.feature-title.1"}} -->
<h3 class="wp-block-heading feature-title"><?php esc_html_e( 'A card title', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"feature-desc","metadata":{"role":"content","name":"features.feature-desc.1"}} -->
<p class="feature-desc"><?php esc_html_e( 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"btn-action"} -->
<div class="wp-block-buttons btn-action">
<!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"role":"content","name":"features.btn-label.1"}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Donate now', 'wp-ja-impact' ); ?></a></div>
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
