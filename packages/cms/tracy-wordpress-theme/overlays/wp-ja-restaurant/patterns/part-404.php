<?php
/**
 * Title: Page not found
 * Slug: wp-ja-restaurant/part-404
 * Description: The 404 screen of the source (error.php): the three-digit code, the message, a line and a button to the home page, on a page of its own.
 * Categories: wp-ja-restaurant, tracy
 * Inserter: no
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"main jr-error","layout":{"type":"default"}} -->
<div class="wp-block-group main jr-error">
<!-- wp:group {"className":"error","layout":{"type":"default"}} -->
<div class="wp-block-group error">
<!-- wp:group {"anchor":"outline","layout":{"type":"default"}} -->
<div class="wp-block-group" id="outline">
<!-- wp:group {"anchor":"errorboxoutline","layout":{"type":"default"}} -->
<div class="wp-block-group" id="errorboxoutline">
<!-- wp:html -->
<div class="error-code"><span class="first">4</span><span class="">0</span><span class="last">4</span></div>
<!-- /wp:html -->
<!-- wp:group {"className":"wrap-text","layout":{"type":"default"}} -->
<div class="wp-block-group wrap-text">
<!-- wp:group {"className":"error-message","layout":{"type":"default"}} -->
<div class="wp-block-group error-message">
<!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'Page not found', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"anchor":"errorboxbody","layout":{"type":"default"}} -->
<div class="wp-block-group" id="errorboxbody">
<!-- wp:paragraph -->
<p><?php esc_html_e( 'Please try one of the following pages:', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:html -->
<a class="button-home" href="<?php echo esc_url( home_url( '/' ) ); ?>" title="<?php esc_attr_e( 'Go to the Home Page', 'wp-ja-restaurant' ); ?>"><?php esc_html_e( 'Home Page', 'wp-ja-restaurant' ); ?></a>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
