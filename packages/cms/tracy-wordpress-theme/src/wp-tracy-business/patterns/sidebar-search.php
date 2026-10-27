<?php
/**
 * Title: Search sidebar
 * Slug: wp-tracy-business/sidebar-search
 * Description: The search sidebar (parts/sidebar-search.html): the section filter and the popular searches. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"className":"tracy-aside__card tracy-aside__filters","layout":{"type":"default"},"metadata":{"name":"search.filters"}} -->
<div class="wp-block-group tracy-aside__card tracy-aside__filters">
<!-- wp:paragraph {"className":"tracy-aside__label"} -->
<p class="tracy-aside__label"><?php echo esc_html__( 'Filter by section', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"tracy-aside__list tracy-aside__filters-list"} -->
<ul class="wp-block-list tracy-aside__list tracy-aside__filters-list">
<!-- wp:list-item -->
<li><a href="/?s="><?php echo esc_html__( 'All', 'wp-tracy-business' ); ?></a></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><a href="/?s=&amp;post_type=page"><?php echo esc_html__( 'Pages', 'wp-tracy-business' ); ?></a></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><a href="/?s=&amp;post_type=post"><?php echo esc_html__( 'News', 'wp-tracy-business' ); ?></a></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-aside__card tracy-aside__popular","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-aside__card tracy-aside__popular">
<!-- wp:paragraph {"className":"tracy-aside__label"} -->
<p class="tracy-aside__label"><?php echo esc_html__( 'Popular searches', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"tracy-chips-row tracy-aside__chips","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group tracy-chips-row tracy-aside__chips">
<!-- wp:paragraph {"className":"tracy-chips__all"} -->
<p class="tracy-chips__all"><a href="/?s=quote"><?php echo esc_html( _x( 'quote', 'popular search', 'wp-tracy-business' ) ); ?></a></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-chips__all"} -->
<p class="tracy-chips__all"><a href="/?s=ISO+45001"><?php echo esc_html( _x( 'ISO 45001', 'popular search', 'wp-tracy-business' ) ); ?></a></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-chips__all"} -->
<p class="tracy-chips__all"><a href="/?s=M%26E"><?php echo esc_html( _x( 'M&E', 'popular search', 'wp-tracy-business' ) ); ?></a></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-chips__all"} -->
<p class="tracy-chips__all"><a href="/?s=careers"><?php echo esc_html( _x( 'careers', 'popular search', 'wp-tracy-business' ) ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
