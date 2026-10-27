<?php
/**
 * Title: Menu list in columns
 * Slug: wp-ja-fresco/acm-menu-1
 * Description: An optional eyebrow, title and lead or a centred menu name with an accent rule under it, then dishes in two or three columns, each with its name, a short line and its price on the right (Joomla ACM `menu` style-1 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: menu, dishes, prices, food, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-menu style-1","metadata":{"name":"menu.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-menu style-1">
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"section-title-wrap","metadata":{"name":"menu.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group section-title-wrap">
<!-- wp:paragraph {"className":"section-title","metadata":{"role":"content","name":"menu.module-title"}} -->
<p class="section-title"><?php esc_html_e( 'Eyebrow', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"main-title","metadata":{"role":"content","name":"menu.main-section"}} -->
<h2 class="wp-block-heading main-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"section-top-desc lead","metadata":{"role":"content","name":"menu.top-desc"}} -->
<p class="section-top-desc lead"><?php esc_html_e( 'A lead of one or two lines.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"className":"menu-type","metadata":{"role":"content","name":"menu.menu-type"}} -->
<h2 class="wp-block-heading menu-type"><?php esc_html_e( 'Menu name', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"dish-list acm-menu--cols-2","metadata":{"name":"menu.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group dish-list acm-menu--cols-2">
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
</section>
<!-- /wp:group -->
