<?php
/**
 * Title: Error page
 * Slug: wp-ja-vega/page-404
 * Description: The masthead of the error page (templates/404.html): the 404 code, the line under it and the Home Page button. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-vega
 * Inserter: no
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:heading {"level":1,"className":"jv-masthead__title"} -->
<h1 class="wp-block-heading jv-masthead__title">404</h1>
<!-- /wp:heading -->
<!-- wp:heading {"level":2,"className":"jv-masthead__subtitle"} -->
<h2 class="wp-block-heading jv-masthead__subtitle"><?php echo esc_html__( 'Not found', 'wp-ja-vega' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:buttons {"className":"jv-actions jv-actions--center"} -->
<div class="wp-block-buttons jv-actions jv-actions--center">
<!-- wp:button {"className":"jv-btn jv-btn--primary"} -->
<div class="wp-block-button jv-btn jv-btn--primary"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html__( 'Home Page', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
