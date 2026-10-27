<?php
/**
 * Title: Error page
 * Slug: wp-ja-impact/page-404
 * Description: The body of the error page (templates/404.html): the 404 digits, the heading, the line about the request and the Home Page button. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"className":"jim-404__digits","layout":{"type":"default"}} -->
<div class="wp-block-group jim-404__digits">
<!-- wp:paragraph {"className":"jim-404__digit jim-404__digit--four1"} -->
<p class="jim-404__digit jim-404__digit--four1">4</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-404__digit jim-404__digit--zero"} -->
<p class="jim-404__digit jim-404__digit--zero">0</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-404__digit jim-404__digit--four2"} -->
<p class="jim-404__digit jim-404__digit--four2">4</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-404__bubble"} -->
<p class="jim-404__bubble"><?php echo esc_html__( 'OH!', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":2,"className":"jim-404__title"} -->
<h2 class="wp-block-heading jim-404__title"><?php echo esc_html__( 'Page not found', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-404__text"} -->
<p class="jim-404__text"><strong><?php echo esc_html__( 'An error has occurred while processing your request.', 'wp-ja-impact' ); ?></strong></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jim-404__home"} -->
<div class="wp-block-buttons jim-404__home">
<!-- wp:button {"className":"jim-btn jim-btn--primary"} -->
<div class="wp-block-button jim-btn jim-btn--primary"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html__( 'Home Page', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
