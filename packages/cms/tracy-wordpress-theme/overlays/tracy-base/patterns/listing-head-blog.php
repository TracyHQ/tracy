<?php
/**
 * Title: Blog heading
 * Slug: tracy-base/listing-head-blog
 * Description: The heading of the posts page (templates/home.html). Its word goes through the theme's text domain, so a site in another language shows it in it.
 * Categories: tracy-base
 * Inserter: no
 *
 * @package tracy-base
 */
?>
<!-- wp:heading {"level":1,"className":"tracy-display"} -->
<h1 class="wp-block-heading tracy-display"><?php echo esc_html__( 'Blog', 'tracy-base' ); ?></h1>
<!-- /wp:heading -->
