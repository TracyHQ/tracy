<?php
/**
 * Title: Text
 * Slug: wp-tracy-business/section-text
 * Description: Eyebrow, heading, intro and an arrow list of points (items: title, text, meta); with an image it becomes a split — illustration left, copy right. Every spec section of type `text`, from a page intro (h1, no items) to the "why" band.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: text, split, why, points, arrow list, intro
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-text"} -->
<section class="wp-block-group wtb-section wtb-text">
<!-- wp:group {"className":"wtb-inner wtb-text__inner"} -->
<div class="wp-block-group wtb-inner wtb-text__inner">
<!-- wp:image {"className":"wtb-text__media","sizeSlug":"large","metadata":{"role":"content","name":"text.img"}} -->
<figure class="wp-block-image size-large wtb-text__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Site crew illustration', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-text__copy"} -->
<div class="wp-block-group wtb-text__copy">
<!-- wp:group {"className":"wtb-head"} -->
<div class="wp-block-group wtb-head">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"text.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Why Northgate', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"wtb-heading","metadata":{"role":"content","name":"text.heading"}} -->
<h2 class="wp-block-heading wtb-heading"><?php esc_html_e( 'One accountable partner from drawing to handover', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"text.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'Design, fabrication and erection under one contract.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"wtb-actions"} -->
<div class="wp-block-buttons wtb-actions">
<!-- wp:button {"className":"is-style-link","metadata":{"role":"content","name":"text.cta.1"}} -->
<div class="wp-block-button is-style-link"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'About the company →', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-text__list"} -->
<div class="wp-block-group wtb-text__list">
<!-- wp:group {"className":"wtb-text__point","metadata":{"name":"text.item.1"}} -->
<div class="wp-block-group wtb-text__point">
<!-- wp:paragraph {"className":"wtb-text__point-title","metadata":{"role":"content","name":"text.item.1.title"}} -->
<p class="wtb-text__point-title"><?php esc_html_e( 'In-house design team of 34 engineers', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-text__point-text","metadata":{"role":"content","name":"text.item.1.text"}} -->
<p class="wtb-text__point-text"><?php esc_html_e( 'Drawing revision cycles cut to under 48 hours.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-text__point-meta","metadata":{"role":"content","name":"text.item.1.meta"}} -->
<p class="wtb-text__point-meta"><?php esc_html_e( 'Since 2019', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-text__point","metadata":{"name":"text.item.2"}} -->
<div class="wp-block-group wtb-text__point">
<!-- wp:paragraph {"className":"wtb-text__point-title","metadata":{"role":"content","name":"text.item.2.title"}} -->
<p class="wtb-text__point-title"><?php esc_html_e( 'ISO 9001 & ISO 45001 certified', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-text__point-text","metadata":{"role":"content","name":"text.item.2.text"}} -->
<p class="wtb-text__point-text"><?php esc_html_e( 'Safety procedures independently audited every six months.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-text__point-meta","metadata":{"role":"content","name":"text.item.2.meta"}} -->
<p class="wtb-text__point-meta"><?php esc_html_e( 'Since 2019', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-text__point","metadata":{"name":"text.item.3"}} -->
<div class="wp-block-group wtb-text__point">
<!-- wp:paragraph {"className":"wtb-text__point-title","metadata":{"role":"content","name":"text.item.3.title"}} -->
<p class="wtb-text__point-title"><?php esc_html_e( 'Schedule backed by a bank guarantee', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-text__point-text","metadata":{"role":"content","name":"text.item.3.text"}} -->
<p class="wtb-text__point-text"><?php esc_html_e( 'Performance guarantees issued on every contract above RUB 150M.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-text__point-meta","metadata":{"role":"content","name":"text.item.3.meta"}} -->
<p class="wtb-text__point-meta"><?php esc_html_e( 'Since 2019', 'wp-tracy-business' ); ?></p>
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
