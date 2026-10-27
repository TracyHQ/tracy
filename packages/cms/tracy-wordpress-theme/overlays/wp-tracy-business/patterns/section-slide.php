<?php
/**
 * Title: Slide list
 * Slug: wp-tracy-business/section-slide
 * Description: Heading and intro, then rows separated by 1px rules: title and text on the left, orange meta (file type · size) and a download link on the right; a row with an image shows it as a thumbnail. Every spec section of type `slide`.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: slides, decks, downloads, list, rows
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-slide"} -->
<section class="wp-block-group wtb-section wtb-slide">
<!-- wp:group {"className":"wtb-inner"} -->
<div class="wp-block-group wtb-inner">
<!-- wp:group {"className":"wtb-head"} -->
<div class="wp-block-group wtb-head">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"slide.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Marketing kit', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"wtb-heading","metadata":{"role":"content","name":"slide.heading"}} -->
<h2 class="wp-block-heading wtb-heading"><?php esc_html_e( 'Ready-made decks', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"slide.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'Marketing builds bespoke decks within two working days.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"wtb-actions"} -->
<div class="wp-block-buttons wtb-actions">
<!-- wp:button {"className":"is-style-orange","metadata":{"role":"content","name":"slide.cta.1"}} -->
<div class="wp-block-button is-style-orange"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Request a deck', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__list"} -->
<div class="wp-block-group wtb-slide__list">
<!-- wp:group {"className":"wtb-slide__row","metadata":{"name":"slide.item.1"}} -->
<div class="wp-block-group wtb-slide__row">
<!-- wp:image {"className":"wtb-slide__thumb","sizeSlug":"large","metadata":{"role":"content","name":"slide.item.1.img"}} -->
<figure class="wp-block-image size-large wtb-slide__thumb"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Slide preview', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-slide__copy"} -->
<div class="wp-block-group wtb-slide__copy">
<!-- wp:heading {"level":3,"className":"wtb-slide__title","metadata":{"role":"content","name":"slide.item.1.title"}} -->
<h3 class="wp-block-heading wtb-slide__title"><?php esc_html_e( 'Corporate Deck 2028 — full slide library', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-slide__text","metadata":{"role":"content","name":"slide.item.1.text"}} -->
<p class="wtb-slide__text"><?php esc_html_e( '8 slides · editable PDF (live text and vector)', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__side"} -->
<div class="wp-block-group wtb-slide__side">
<!-- wp:paragraph {"className":"wtb-slide__meta","metadata":{"role":"content","name":"slide.item.1.meta"}} -->
<p class="wtb-slide__meta"><?php esc_html_e( 'PDF · 14 KB', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-slide__link","metadata":{"role":"content","name":"slide.item.1.href"}} -->
<p class="wtb-slide__link"><a href="#"><?php esc_html_e( 'Download ↓', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__row","metadata":{"name":"slide.item.2"}} -->
<div class="wp-block-group wtb-slide__row">
<!-- wp:image {"className":"wtb-slide__thumb","sizeSlug":"large","metadata":{"role":"content","name":"slide.item.2.img"}} -->
<figure class="wp-block-image size-large wtb-slide__thumb"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Slide preview', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-slide__copy"} -->
<div class="wp-block-group wtb-slide__copy">
<!-- wp:heading {"level":3,"className":"wtb-slide__title","metadata":{"role":"content","name":"slide.item.2.title"}} -->
<h3 class="wp-block-heading wtb-slide__title"><?php esc_html_e( 'Corporate deck 2026', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-slide__text","metadata":{"role":"content","name":"slide.item.2.text"}} -->
<p class="wtb-slide__text"><?php esc_html_e( '5 slides · updated 14 Aug 2026', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__side"} -->
<div class="wp-block-group wtb-slide__side">
<!-- wp:paragraph {"className":"wtb-slide__meta","metadata":{"role":"content","name":"slide.item.2.meta"}} -->
<p class="wtb-slide__meta"><?php esc_html_e( 'PDF · 273 KB', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-slide__link","metadata":{"role":"content","name":"slide.item.2.href"}} -->
<p class="wtb-slide__link"><a href="#"><?php esc_html_e( 'Download ↓', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__row","metadata":{"name":"slide.item.3"}} -->
<div class="wp-block-group wtb-slide__row">
<!-- wp:image {"className":"wtb-slide__thumb","sizeSlug":"large","metadata":{"role":"content","name":"slide.item.3.img"}} -->
<figure class="wp-block-image size-large wtb-slide__thumb"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Slide preview', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-slide__copy"} -->
<div class="wp-block-group wtb-slide__copy">
<!-- wp:heading {"level":3,"className":"wtb-slide__title","metadata":{"role":"content","name":"slide.item.3.title"}} -->
<h3 class="wp-block-heading wtb-slide__title"><?php esc_html_e( 'Sales proposal: production building', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-slide__text","metadata":{"role":"content","name":"slide.item.3.text"}} -->
<p class="wtb-slide__text"><?php esc_html_e( '5 slides · client-ready template', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__side"} -->
<div class="wp-block-group wtb-slide__side">
<!-- wp:paragraph {"className":"wtb-slide__meta","metadata":{"role":"content","name":"slide.item.3.meta"}} -->
<p class="wtb-slide__meta"><?php esc_html_e( 'PDF · 239 KB', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-slide__link","metadata":{"role":"content","name":"slide.item.3.href"}} -->
<p class="wtb-slide__link"><a href="#"><?php esc_html_e( 'Download ↓', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__row","metadata":{"name":"slide.item.4"}} -->
<div class="wp-block-group wtb-slide__row">
<!-- wp:image {"className":"wtb-slide__thumb","sizeSlug":"large","metadata":{"role":"content","name":"slide.item.4.img"}} -->
<figure class="wp-block-image size-large wtb-slide__thumb"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Slide preview', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-slide__copy"} -->
<div class="wp-block-group wtb-slide__copy">
<!-- wp:heading {"level":3,"className":"wtb-slide__title","metadata":{"role":"content","name":"slide.item.4.title"}} -->
<h3 class="wp-block-heading wtb-slide__title"><?php esc_html_e( 'Construction progress report', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-slide__text","metadata":{"role":"content","name":"slide.item.4.text"}} -->
<p class="wtb-slide__text"><?php esc_html_e( '5 slides · monthly format', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__side"} -->
<div class="wp-block-group wtb-slide__side">
<!-- wp:paragraph {"className":"wtb-slide__meta","metadata":{"role":"content","name":"slide.item.4.meta"}} -->
<p class="wtb-slide__meta"><?php esc_html_e( 'PDF · 220 KB', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-slide__link","metadata":{"role":"content","name":"slide.item.4.href"}} -->
<p class="wtb-slide__link"><a href="#"><?php esc_html_e( 'Download ↓', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__row","metadata":{"name":"slide.item.5"}} -->
<div class="wp-block-group wtb-slide__row">
<!-- wp:image {"className":"wtb-slide__thumb","sizeSlug":"large","metadata":{"role":"content","name":"slide.item.5.img"}} -->
<figure class="wp-block-image size-large wtb-slide__thumb"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Slide preview', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"wtb-slide__copy"} -->
<div class="wp-block-group wtb-slide__copy">
<!-- wp:heading {"level":3,"className":"wtb-slide__title","metadata":{"role":"content","name":"slide.item.5.title"}} -->
<h3 class="wp-block-heading wtb-slide__title"><?php esc_html_e( 'Trade-show stand deck', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-slide__text","metadata":{"role":"content","name":"slide.item.5.text"}} -->
<p class="wtb-slide__text"><?php esc_html_e( '4 slides · exhibition screen', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-slide__side"} -->
<div class="wp-block-group wtb-slide__side">
<!-- wp:paragraph {"className":"wtb-slide__meta","metadata":{"role":"content","name":"slide.item.5.meta"}} -->
<p class="wtb-slide__meta"><?php esc_html_e( 'PDF · 184 KB', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-slide__link","metadata":{"role":"content","name":"slide.item.5.href"}} -->
<p class="wtb-slide__link"><a href="#"><?php esc_html_e( 'Download ↓', 'wp-tracy-business' ); ?></a></p>
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
