<?php
/**
 * Title: Related posts heading
 * Slug: wp-ja-vega/head-related-posts
 * Description: The label and title above the related posts of an article (templates/page-article.html). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-vega
 * Inserter: no
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal"} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php echo esc_html__( 'Continue Reading', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1"} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php echo esc_html__( 'Related Posts', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
