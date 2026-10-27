<?php
/**
 * Title: Related articles heading
 * Slug: wp-tracy-business/single-related-title
 * Description: The heading over the related articles (templates/single.html). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:heading {"level":2,"className":"tracy-related__title"} -->
<h2 class="wp-block-heading tracy-related__title"><?php echo esc_html__( 'Related articles', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
