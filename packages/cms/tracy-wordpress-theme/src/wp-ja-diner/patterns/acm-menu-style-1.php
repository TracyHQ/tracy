<?php
/**
 * Title: Menu: style 1
 * Slug: wp-ja-diner/acm-menu-style-1
 * Description: Menu dishes as a two-column list of name, price and description with a button (Joomla ACM menu style-1 of JA Diner). A tab panel after a container-tabs section.
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: menu, dishes, acm
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:group {"className":"t3-section module jd-tab-panel padding-top","metadata":{"name":"menu.root"}} -->
<div class="wp-block-group t3-section module jd-tab-panel padding-top">
<!-- wp:heading {"level":2,"className":"jd-tab-title","metadata":{"role":"content","name":"menu.tab-title"}} -->
<h2 class="wp-block-heading jd-tab-title"><?php esc_html_e( 'Tab title', 'wp-ja-diner' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"acm-menu"} -->
<div class="wp-block-group acm-menu">
<!-- wp:group {"className":"style-1 menu-items","metadata":{"name":"menu.list"}} -->
<div class="wp-block-group style-1 menu-items">
<!-- wp:group {"className":"row equal-height"} -->
<div class="wp-block-group row equal-height">
<!-- wp:group {"className":"dish-item col col-sm-6","metadata":{"name":"menu.item.1"}} -->
<div class="wp-block-group dish-item col col-sm-6">
<!-- wp:group {"className":"item-inner"} -->
<div class="wp-block-group item-inner">
<!-- wp:group {"className":"dish-info clearfix"} -->
<div class="wp-block-group dish-info clearfix">
<!-- wp:heading {"level":4,"className":"dish-name","metadata":{"role":"content","name":"menu.dish-name.1"}} -->
<h4 class="wp-block-heading dish-name"><?php esc_html_e( 'Dish name', 'wp-ja-diner' ); ?><span class="dish-price pull-right"><?php esc_html_e( '$30', 'wp-ja-diner' ); ?></span></h4>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"dish-description","metadata":{"role":"content","name":"menu.dish-description.1"}} -->
<p class="dish-description"><?php esc_html_e( 'A short description of the dish.', 'wp-ja-diner' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"menu-action"} -->
<div class="wp-block-group menu-action">
<!-- wp:paragraph {"className":"menu-btn","metadata":{"role":"content","name":"menu.basic-btn"}} -->
<p class="menu-btn"><a class="btn btn-primary" href="#"><?php esc_html_e( 'View full menu', 'wp-ja-diner' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
