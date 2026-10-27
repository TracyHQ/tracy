<?php
/**
 * Title: Page not found
 * Slug: wp-ja-diner/part-404
 * Description: The 404 screen of the source (error.php): the three-digit code, the message, a line and a button to the home page, on a page of its own.
 * Categories: wp-ja-diner, tracy
 * Inserter: no
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:group {"className":"page-container jd-error","layout":{"type":"default"}} -->
<div class="wp-block-group page-container jd-error">
<!-- wp:html -->
<div class="error-code"><div class="text-error"><span>404</span></div></div>
<!-- /wp:html -->
<!-- wp:group {"className":"group-text","layout":{"type":"default"}} -->
<div class="wp-block-group group-text">
<!-- wp:group {"className":"error-message","layout":{"type":"default"}} -->
<div class="wp-block-group error-message">
<!-- wp:heading -->
<h2 class="wp-block-heading"><span><?php esc_html_e( 'Page not found', 'wp-ja-diner' ); ?></span></h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php esc_html_e( 'Please try one of the following pages:', 'wp-ja-diner' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:html -->
<a class="btn-home-page" href="<?php echo esc_url( home_url( '/' ) ); ?>" title="<?php esc_attr_e( 'Go to the Home Page', 'wp-ja-diner' ); ?>"><?php esc_html_e( 'Home Page', 'wp-ja-diner' ); ?></a>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
