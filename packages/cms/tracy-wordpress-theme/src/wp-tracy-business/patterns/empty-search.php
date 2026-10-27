<?php
/**
 * Title: Empty search
 * Slug: wp-tracy-business/empty-search
 * Description: The line the search page shows when nothing matched (templates/search.html). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted"><?php echo esc_html__( 'Nothing matched.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
