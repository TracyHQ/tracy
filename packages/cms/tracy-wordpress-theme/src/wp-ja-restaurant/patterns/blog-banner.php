<?php
/**
 * Title: Blog banner module
 * Slug: wp-ja-restaurant/blog-banner
 * Description: The "Only $5.99" lunch banner under the blog sidebar (the source's custom module 107).
 * Categories: wp-ja-restaurant, tracy
 * Inserter: no
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-module module no-padding","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module module no-padding">
<!-- wp:group {"className":"module-inner","layout":{"type":"default"}} -->
<div class="wp-block-group module-inner">
<!-- wp:group {"className":"module-ct","layout":{"type":"default"}} -->
<div class="wp-block-group module-ct">
<!-- wp:group {"className":"banner-bonus","layout":{"type":"default"}} -->
<div class="wp-block-group banner-bonus">
<!-- wp:group {"className":"banner-image","layout":{"type":"default"}} -->
<div class="wp-block-group banner-image">
<!-- wp:image {"sizeSlug":"large","className":"jr-banner-picture"} -->
<figure class="wp-block-image size-large jr-banner-picture"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Weekday lunch special at RES', 'wp-ja-restaurant' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"price"} -->
<p class="price"><?php esc_html_e( 'Only $5.99', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><?php esc_html_e( 'Soup or salad of the day', 'wp-ja-restaurant' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><?php esc_html_e( 'Fresh bread from our oven', 'wp-ja-restaurant' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><?php esc_html_e( 'Coffee or iced tea included', 'wp-ja-restaurant' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><?php esc_html_e( 'Monday to Friday, 11 am - 2 pm', 'wp-ja-restaurant' ); ?></li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->
<!-- wp:paragraph {"className":"actions text-right"} -->
<p class="actions text-right"><a class="btn btn-primary" href="<?php echo esc_url( home_url( '/contact/phone-reservation/' ) ); ?>"><?php esc_html_e( 'Book a Table', 'wp-ja-restaurant' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
