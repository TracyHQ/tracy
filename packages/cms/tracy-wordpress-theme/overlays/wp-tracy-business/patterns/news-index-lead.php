<?php
/**
 * Title: News index lead
 * Slug: wp-tracy-business/news-index-lead
 * Description: The lead of the news index (templates/home.html, block home.lead, which inc/extra.php fills from the posts page), beside the post count. A pattern holds whole blocks only: the lead's flex row stays in the template with the count it lines up against. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:paragraph {"className":"tracy-lead","metadata":{"name":"home.lead"}} -->
<p class="tracy-lead"><?php echo esc_html__( 'Updates and notes from the team.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
