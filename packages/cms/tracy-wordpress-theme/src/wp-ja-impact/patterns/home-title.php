<?php
/**
 * Title: Posts page title
 * Slug: wp-ja-impact/home-title
 * Description: The heading of the posts listing (templates/home.html), the word Blog. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:heading {"level":1,"className":"tracy-display"} -->
<h1 class="wp-block-heading tracy-display"><?php echo esc_html__( 'Blog', 'wp-ja-impact' ); ?></h1>
<!-- /wp:heading -->
