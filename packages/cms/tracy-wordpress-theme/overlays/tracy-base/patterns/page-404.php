<?php
/**
 * Title: Error page
 * Slug: tracy-base/page-404
 * Description: The body of the error page (templates/404.html): the 404 code, the heading and the button home. Its words go through the theme's text domain, so a site in another language shows them in it, and the button names no company, so a renamed site shows no demo name there.
 * Categories: tracy-base
 * Inserter: no
 *
 * @package tracy-base
 */
?>
<!-- wp:paragraph {"className":"tracy-404__code"} -->
<p class="tracy-404__code">404</p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"tracy-404__msg"} -->
<h1 class="wp-block-heading tracy-404__msg"><?php echo esc_html__( 'Page not found', 'tracy-base' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html__( 'Back to home', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
