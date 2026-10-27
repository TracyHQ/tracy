<?php
/**
 * Title: Template body: home
 * Slug: wp-ja-kinetic/template-home
 * Description: The body of templates/home.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"tracy-main tracy-listing","layout":{"type":"default"}} -->
<main class="wp-block-group tracy-main tracy-listing">
<!-- wp:group {"className":"tracy-container","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-container">
<!-- wp:group {"className":"tracy-listing__head","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-listing__head">
<!-- wp:heading {"level":1,"className":"tracy-display"} -->
<h1 class="wp-block-heading tracy-display"><?php echo esc_html__( 'Blog', 'wp-ja-kinetic' ); ?></h1>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:pattern {"slug":"tracy/cards"} /-->
</div>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
