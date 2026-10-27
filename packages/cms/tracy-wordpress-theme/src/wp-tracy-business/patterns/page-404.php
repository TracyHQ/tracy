<?php
/**
 * Title: Error page
 * Slug: wp-tracy-business/page-404
 * Description: The body of the error page (templates/404.html, block 404.body, which inc/extra.php fills with the draft 404 page when the site has one): code, heading, line, search and the home link. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"className":"tracy-article tracy-container tracy-404","layout":{"type":"default"},"metadata":{"name":"404.body"}} -->
<div class="wp-block-group tracy-article tracy-container tracy-404">
<!-- wp:paragraph {"className":"tracy-eyebrow tracy-eyebrow--orange tracy-404__code"} -->
<p class="tracy-eyebrow tracy-eyebrow--orange tracy-404__code">404</p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"tracy-display"} -->
<h1 class="wp-block-heading tracy-display"><?php echo esc_html__( 'Page not found', 'wp-tracy-business' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead"} -->
<p class="tracy-lead"><?php echo esc_html__( 'The page may have moved, or the address may be mistyped. Try a search, or start from the home page.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:search {"label":"Search","showLabel":false,"placeholder":"Search the site","buttonText":"Search","className":"tracy-listing__search"} /-->
<!-- wp:buttons {"className":"wtb-actions"} -->
<div class="wp-block-buttons wtb-actions">
<!-- wp:button {"className":"is-style-link"} -->
<div class="wp-block-button is-style-link"><a class="wp-block-button__link wp-element-button" href="/"><?php echo esc_html__( '← Back to home', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
