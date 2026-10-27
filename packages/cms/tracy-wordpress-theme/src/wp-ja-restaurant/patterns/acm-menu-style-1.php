<?php
/**
 * Title: Menu: style 1
 * Slug: wp-ja-restaurant/acm-menu-style-1
 * Description: Menu dishes as a list of name, price and description (Joomla ACM `menu` style-1 of JA Restaurant). Used standalone or as a tab panel after a tabs section.
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: menu, dishes, acm
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"tagName":"section","className":"t3-section-module","metadata":{"name":"menu.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group t3-section-module">
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:heading {"level":2,"className":"jr-tab-title","metadata":{"role":"content","name":"menu.tab-title"}} -->
<h2 class="wp-block-heading jr-tab-title"><?php esc_html_e( 'Tab title', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:heading {"level":2,"className":"t3-section-title","metadata":{"role":"content","name":"menu.module-title"}} -->
<h2 class="wp-block-heading t3-section-title"><?php esc_html_e( 'Section title', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"t3-section-ct","metadata":{"name":"menu.content"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"acm-menu","metadata":{"name":"menu.box"},"layout":{"type":"default"}} -->
<div class="wp-block-group acm-menu">
<!-- wp:group {"className":"style-1 menu-items","metadata":{"name":"menu.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group style-1 menu-items">
<!-- wp:group {"className":"dish-item","metadata":{"name":"menu.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group dish-item">
<!-- wp:group {"className":"item-inner","layout":{"type":"default"}} -->
<div class="wp-block-group item-inner">
<!-- wp:heading {"level":3,"className":"dish-name","metadata":{"role":"content","name":"menu.dish-name.1"}} -->
<h3 class="wp-block-heading dish-name"><?php esc_html_e( 'Dish name', 'wp-ja-restaurant' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"dish-price","metadata":{"role":"content","name":"menu.dish-price.1"}} -->
<p class="dish-price"><?php esc_html_e( '$30', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"dish-description","metadata":{"role":"content","name":"menu.dish-description.1"}} -->
<p class="dish-description"><?php esc_html_e( 'A short description of the dish.', 'wp-ja-restaurant' ); ?></p>
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
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
