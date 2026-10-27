<?php
/**
 * Title: News chip All
 * Slug: wp-tracy-business/news-chip-all
 * Description: The All chip of a news category (templates/category.html), back to the news index. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:paragraph {"className":"tracy-chips__all"} -->
<p class="tracy-chips__all"><a href="/news/"><?php echo esc_html__( 'All', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
