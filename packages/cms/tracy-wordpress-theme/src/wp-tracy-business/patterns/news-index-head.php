<?php
/**
 * Title: News index head
 * Slug: wp-tracy-business/news-index-head
 * Description: The heading of the news index (templates/home.html, block home.title, which inc/extra.php fills from the posts page; the lead is news-index-lead). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:heading {"level":1,"className":"tracy-display","metadata":{"name":"home.title"}} -->
<h1 class="wp-block-heading tracy-display"><?php echo esc_html__( 'News', 'wp-tracy-business' ); ?></h1>
<!-- /wp:heading -->
