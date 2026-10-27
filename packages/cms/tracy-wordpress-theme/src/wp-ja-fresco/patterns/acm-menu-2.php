<?php
/**
 * Title: Picture beside a priced list
 * Slug: wp-ja-fresco/acm-menu-2
 * Description: A large picture on one side and, on the other, a menu name over dishes with a short description and a price; the picture side is set per section (Joomla ACM `menu` style-2 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: menu, dishes, prices, picture, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-menu style-2","metadata":{"name":"menu.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-menu style-2">
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:heading {"className":"menu-type","metadata":{"role":"content","name":"menu.menu-type"}} -->
<h2 class="wp-block-heading menu-type"><?php esc_html_e( 'Menu name', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"menu-row media-left","metadata":{"name":"menu.row"},"layout":{"type":"default"}} -->
<div class="wp-block-group menu-row media-left">
<!-- wp:image {"sizeSlug":"full","className":"menu-image","metadata":{"role":"content","name":"menu.menu-image"}} -->
<figure class="wp-block-image size-full menu-image"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"dish-list","metadata":{"name":"menu.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group dish-list">
<!-- wp:group {"className":"dish-item","metadata":{"name":"menu.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group dish-item">
<!-- wp:group {"className":"dish-title","layout":{"type":"default"}} -->
<div class="wp-block-group dish-title">
<!-- wp:heading {"level":3,"className":"dish-name","metadata":{"role":"content","name":"menu.dish-name.1"}} -->
<h3 class="wp-block-heading dish-name"><?php esc_html_e( 'Dish name', 'wp-ja-fresco' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"dish-description","metadata":{"role":"content","name":"menu.dish-description.1"}} -->
<p class="dish-description"><?php esc_html_e( 'What is in it, in one line', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"dish-price","metadata":{"role":"content","name":"menu.dish-price.1"}} -->
<p class="dish-price"><?php esc_html_e( '$30', 'wp-ja-fresco' ); ?></p>
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
