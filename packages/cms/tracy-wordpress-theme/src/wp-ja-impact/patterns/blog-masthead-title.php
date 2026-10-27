<?php
/**
 * Title: Blog article masthead title
 * Slug: wp-ja-impact/blog-masthead-title
 * Description: The heading of a blog article's masthead (templates/single-blog-detail.html), the word Blog. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:heading {"textAlign":"center","level":1,"className":"jim-masthead__title","metadata":{"name":"article.masthead-title"}} -->
<h1 class="wp-block-heading has-text-align-center jim-masthead__title"><?php echo esc_html__( 'Blog', 'wp-ja-impact' ); ?></h1>
<!-- /wp:heading -->
