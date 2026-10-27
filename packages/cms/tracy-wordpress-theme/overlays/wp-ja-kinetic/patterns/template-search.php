<?php
/**
 * Title: Template body: search
 * Slug: wp-ja-kinetic/template-search
 * Description: The body of templates/search.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:html -->
<div id="system-message-container" aria-live="polite"></div>
<!-- /wp:html -->
<!-- wp:group {"tagName":"main","className":"kinetic-finder com-finder finder","layout":{"type":"default"}} -->
<main class="wp-block-group kinetic-finder com-finder finder">
<!-- wp:group {"className":"kinetic-finder__masthead hx-grid-bg","layout":{"type":"default"}} -->
<div class="wp-block-group kinetic-finder__masthead hx-grid-bg">
<!-- wp:group {"className":"kinetic-finder__masthead-inner","layout":{"type":"default"}} -->
<div class="wp-block-group kinetic-finder__masthead-inner">
<!-- wp:html -->
<span class="kinetic-eyebrow"><?php echo esc_html__( 'SEARCH', 'wp-ja-kinetic' ); ?></span>
<!-- /wp:html -->
<!-- wp:heading {"level":1,"className":"kinetic-finder__title","metadata":{"name":"search.title"}} -->
<h1 class="wp-block-heading kinetic-finder__title"><?php /* translators: %s: the site's name. */ echo esc_html( sprintf( __( 'Search %s', 'wp-ja-kinetic' ), get_bloginfo( 'name' ) ) ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-mast-sub kinetic-finder__sub"} -->
<p class="hx-mast-sub kinetic-finder__sub" style="margin:18px auto 0;max-width:640px;font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:17px;line-height:1.6;color:var(--text);"><?php echo esc_html__( 'Find docs, blog posts and changelog entries in one place.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"com-finder__form kinetic-finder__form","layout":{"type":"default"}} -->
<div id="search-form" class="wp-block-group com-finder__form kinetic-finder__form">
<!-- wp:wp-ja-kinetic/kinetic-search-form /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"com-finder__results kinetic-finder__results","layout":{"type":"default"}} -->
<div id="search-results" class="wp-block-group com-finder__results kinetic-finder__results">
<!-- wp:wp-ja-kinetic/kinetic-search-results /-->
</div>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
