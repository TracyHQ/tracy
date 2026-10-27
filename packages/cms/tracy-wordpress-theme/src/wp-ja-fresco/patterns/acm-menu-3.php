<?php
/**
 * Title: Dish cards with a picture and a price
 * Slug: wp-ja-fresco/acm-menu-3
 * Description: A section title over cards in two to four columns, each with a dish picture carrying its price, the dish name and a short description (Joomla ACM `menu` style-3 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: menu, dishes, cards, prices, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-menu style-3","metadata":{"name":"menu.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-menu style-3">
<!-- wp:group {"className":"jf-container section-title-wrap","metadata":{"name":"menu.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group jf-container section-title-wrap">
<!-- wp:heading {"className":"main-title","metadata":{"role":"content","name":"menu.main-section"}} -->
<h2 class="wp-block-heading main-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"menu-grid acm-menu--cols-3","metadata":{"name":"menu.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group menu-grid acm-menu--cols-3">
<!-- wp:group {"className":"menu-card","metadata":{"name":"menu.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group menu-card">
<!-- wp:group {"className":"menu-card-media","layout":{"type":"default"}} -->
<div class="wp-block-group menu-card-media">
<!-- wp:image {"sizeSlug":"full","lightbox":{"enabled":true},"className":"img-intro","metadata":{"role":"content","name":"menu.img-icon.1"}} -->
<figure class="wp-block-image size-full img-intro"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"menu-card-price","metadata":{"role":"content","name":"menu.price.1"}} -->
<p class="menu-card-price"><?php esc_html_e( '12$', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"menu-card-title","metadata":{"role":"content","name":"menu.title.1"}} -->
<h4 class="wp-block-heading menu-card-title"><?php esc_html_e( 'Dish name', 'wp-ja-fresco' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"menu-card-desc","metadata":{"role":"content","name":"menu.description.1"}} -->
<p class="menu-card-desc"><?php esc_html_e( 'What is in it', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
