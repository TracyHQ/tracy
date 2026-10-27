<?php
/**
 * Title: More projects heading
 * Slug: wp-ja-vega/head-more-projects
 * Description: The label and title above the other projects of a project page (templates/post-project.html). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-vega
 * Inserter: no
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal"} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php echo esc_html__( 'Portfolio', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1"} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php echo esc_html__( 'More our projects', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
