<?php
/**
 * Title: Search page title
 * Slug: wp-ja-impact/search-title
 * Description: The heading of the search page's masthead (templates/search.html), through the theme's text domain, so a site in another language shows it in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:heading {"textAlign":"center","level":1,"className":"jim-masthead__title","metadata":{"name":"search.title"}} -->
<h1 class="wp-block-heading has-text-align-center jim-masthead__title"><?php echo esc_html__( 'Search', 'wp-ja-impact' ); ?></h1>
<!-- /wp:heading -->
