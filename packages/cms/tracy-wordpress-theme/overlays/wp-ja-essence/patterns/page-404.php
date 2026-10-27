<?php
/**
 * Title: Error page
 * Slug: wp-ja-essence/page-404
 * Description: The card of the error page (templates/404.html): the 404 code, the heading, the line about the request and the Home Page button. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-essence
 * Inserter: no
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-404__card","layout":{"type":"default"}} -->
<div class="wp-block-group je-404__card">
<!-- wp:paragraph {"align":"center","className":"je-404__code"} -->
<p class="has-text-align-center je-404__code">404</p>
<!-- /wp:paragraph -->
<!-- wp:heading {"textAlign":"center","level":1,"className":"je-page__title"} -->
<h1 class="wp-block-heading has-text-align-center je-page__title"><?php echo esc_html__( 'Page not found', 'wp-ja-essence' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"align":"center"} -->
<p class="has-text-align-center"><?php echo esc_html__( 'An error has occurred while processing your request.', 'wp-ja-essence' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button {"className":"je-btn-primary"} -->
<div class="wp-block-button je-btn-primary"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html__( 'Home Page', 'wp-ja-essence' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
