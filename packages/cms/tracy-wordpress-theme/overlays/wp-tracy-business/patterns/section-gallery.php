<?php
/**
 * Title: Gallery
 * Slug: wp-tracy-business/section-gallery
 * Description: Logo strip: an eyebrow label on the left, bordered logo cells on the right (items: image, title as caption). Every spec section of type `gallery`; the seeder makes one item per image when the spec lists images and no items.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: gallery, logos, clients, strip
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-gallery"} -->
<section class="wp-block-group wtb-section wtb-gallery">
<!-- wp:group {"className":"wtb-inner wtb-gallery__inner"} -->
<div class="wp-block-group wtb-inner wtb-gallery__inner">
<!-- wp:group {"className":"wtb-gallery__head"} -->
<div class="wp-block-group wtb-gallery__head">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"gallery.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Clients we have built for', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-heading","metadata":{"role":"content","name":"gallery.heading"}} -->
<h3 class="wp-block-heading wtb-heading"><?php esc_html_e( 'Trusted by manufacturers', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"gallery.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'Logos shown with permission.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-gallery__grid"} -->
<div class="wp-block-group wtb-gallery__grid">
<!-- wp:group {"className":"wtb-gallery__item","metadata":{"name":"gallery.item.1"}} -->
<div class="wp-block-group wtb-gallery__item">
<!-- wp:image {"className":"wtb-gallery__media","sizeSlug":"large","metadata":{"role":"content","name":"gallery.item.1.img"}} -->
<figure class="wp-block-image size-large wtb-gallery__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Elektra logo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"wtb-gallery__caption","metadata":{"role":"content","name":"gallery.item.1.title"}} -->
<p class="wtb-gallery__caption"><?php esc_html_e( 'Elektra', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-gallery__item","metadata":{"name":"gallery.item.2"}} -->
<div class="wp-block-group wtb-gallery__item">
<!-- wp:image {"className":"wtb-gallery__media","sizeSlug":"large","metadata":{"role":"content","name":"gallery.item.2.img"}} -->
<figure class="wp-block-image size-large wtb-gallery__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Volgamash logo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"wtb-gallery__caption","metadata":{"role":"content","name":"gallery.item.2.title"}} -->
<p class="wtb-gallery__caption"><?php esc_html_e( 'Volgamash', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-gallery__item","metadata":{"name":"gallery.item.3"}} -->
<div class="wp-block-group wtb-gallery__item">
<!-- wp:image {"className":"wtb-gallery__media","sizeSlug":"large","metadata":{"role":"content","name":"gallery.item.3.img"}} -->
<figure class="wp-block-image size-large wtb-gallery__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Severstroy logo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"wtb-gallery__caption","metadata":{"role":"content","name":"gallery.item.3.title"}} -->
<p class="wtb-gallery__caption"><?php esc_html_e( 'Severstroy', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-gallery__item","metadata":{"name":"gallery.item.4"}} -->
<div class="wp-block-group wtb-gallery__item">
<!-- wp:image {"className":"wtb-gallery__media","sizeSlug":"large","metadata":{"role":"content","name":"gallery.item.4.img"}} -->
<figure class="wp-block-image size-large wtb-gallery__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Agrotech logo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"wtb-gallery__caption","metadata":{"role":"content","name":"gallery.item.4.title"}} -->
<p class="wtb-gallery__caption"><?php esc_html_e( 'Agrotech', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-gallery__item","metadata":{"name":"gallery.item.5"}} -->
<div class="wp-block-group wtb-gallery__item">
<!-- wp:image {"className":"wtb-gallery__media","sizeSlug":"large","metadata":{"role":"content","name":"gallery.item.5.img"}} -->
<figure class="wp-block-image size-large wtb-gallery__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Novopak logo', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"wtb-gallery__caption","metadata":{"role":"content","name":"gallery.item.5.title"}} -->
<p class="wtb-gallery__caption"><?php esc_html_e( 'Novopak', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
