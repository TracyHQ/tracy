<?php
/**
 * Title: Hero with picture background
 * Slug: wp-ja-fresco/acm-hero
 * Description: A full-width picture under a dark veil with a vertical eyebrow on the left, a large centred title, a lead and two outline buttons (Joomla ACM `hero` style-1 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: hero, banner, welcome, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-hero style-1","metadata":{"name":"hero.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-hero style-1">
<!-- wp:group {"className":"hero-list","metadata":{"name":"hero.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group hero-list">
<!-- wp:group {"className":"hero-item","metadata":{"name":"hero.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group hero-item">
<!-- wp:image {"sizeSlug":"full","className":"hero-bg","metadata":{"role":"content","name":"hero.image-decor.1"}} -->
<figure class="wp-block-image size-full hero-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hero-content","layout":{"type":"default"}} -->
<div class="wp-block-group hero-content">
<!-- wp:paragraph {"className":"vertical-text","metadata":{"role":"content","name":"hero.sub-title.1"}} -->
<p class="vertical-text"><?php esc_html_e( 'Welcome to the house', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"hero-title","metadata":{"role":"content","name":"hero.title.1"}} -->
<h1 class="wp-block-heading hero-title"><?php esc_html_e( 'A short headline', 'wp-ja-fresco' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead description","metadata":{"role":"content","name":"hero.desc.1"}} -->
<p class="lead description"><?php esc_html_e( 'Two lines that say what the place serves and why to come.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"acm-action","layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons acm-action">
<!-- wp:button {"className":"btn btn-outline-primary","metadata":{"role":"content","name":"hero.button.1"}} -->
<div class="wp-block-button btn btn-outline-primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'See menu', 'wp-ja-fresco' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"btn btn-outline-primary","metadata":{"role":"content","name":"hero.button-2.1"}} -->
<div class="wp-block-button btn btn-outline-primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Book your table', 'wp-ja-fresco' ); ?></a></div>
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
