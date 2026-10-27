<?php
/**
 * Title: Blog sidebar
 * Slug: wp-ja-restaurant/part-sidebar
 * Description: The sidebar of the blog: the news categories (red box) and the most read articles, as the source's modules 97 and 109. Drawn by the sidebar template part.
 * Categories: wp-ja-restaurant, tracy
 * Inserter: no
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-module module module-primary no-padding","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module module module-primary no-padding">
<!-- wp:group {"className":"module-inner","layout":{"type":"default"}} -->
<div class="wp-block-group module-inner">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><span><?php esc_html_e( 'Categories', 'wp-ja-restaurant' ); ?></span></h3>
<!-- /wp:heading -->
<!-- wp:group {"className":"module-ct","layout":{"type":"default"}} -->
<div class="wp-block-group module-ct">
<!-- wp:wp-ja-restaurant/blog-categories /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:wp-ja-restaurant/blog-testimonials /-->
<!-- wp:group {"className":"t3-module module ","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module module ">
<!-- wp:group {"className":"module-inner","layout":{"type":"default"}} -->
<div class="wp-block-group module-inner">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><span><?php esc_html_e( 'Most Read', 'wp-ja-restaurant' ); ?></span></h3>
<!-- /wp:heading -->
<!-- wp:group {"className":"module-ct","layout":{"type":"default"}} -->
<div class="wp-block-group module-ct">
<!-- wp:wp-ja-restaurant/blog-mostread /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
