<?php
/**
 * Title: News chip All (current)
 * Slug: wp-tracy-business/news-chip-all-current
 * Description: The All chip of the news index (templates/home.html), marked as the current page. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:paragraph {"className":"tracy-chips__all"} -->
<p class="tracy-chips__all"><a href="/news/" aria-current="page"><?php echo esc_html__( 'All', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
