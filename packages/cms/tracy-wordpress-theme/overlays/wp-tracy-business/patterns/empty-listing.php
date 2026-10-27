<?php
/**
 * Title: Empty listing
 * Slug: wp-tracy-business/empty-listing
 * Description: The line a listing shows when it has no post (templates index, home and category). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted"><?php echo esc_html__( 'Nothing here yet.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
