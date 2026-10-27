<?php
/**
 * Title: Latest posts beside a headline
 * Slug: wp-ja-vega/section-blog
 * Description: A label, a headline and a button on the left, and a list of the latest blog posts on the right (the Joomla `mod_articles_category` grid layout): a picture, the date, the tags and the title per post. The posts come from a Query Loop on the blog category, ordered by title.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: blog, news, posts, latest, articles
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-blog-sec","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-blog-sec">
<!-- wp:group {"className":"jv-container jv-blog","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container jv-blog">
<!-- wp:group {"className":"jv-blog__head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-blog__head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal","metadata":{"role":"content","name":"articles-category.section-title"}} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php esc_html_e( 'Blog & news', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php esc_html_e( 'Latest news, events and press', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jv-actions tracy-motion-reveal tracy-motion-delay-3"} -->
<div class="wp-block-buttons jv-actions tracy-motion-reveal tracy-motion-delay-3">
<!-- wp:button {"className":"jv-btn jv-btn--primary jv-btn--arrow","metadata":{"role":"content","name":"articles-category.title-btn"}} -->
<div class="wp-block-button jv-btn jv-btn--primary jv-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'View all our blog', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":22,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"title","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaVegaCategory":"blogs"},"className":"jv-blog__list"} -->
<div class="wp-block-query jv-blog__list">
<!-- wp:post-template {"className":"jv-stagger"} -->
<!-- wp:group {"className":"jv-post tracy-motion-reveal","layout":{"type":"default"}} -->
<div class="wp-block-group jv-post tracy-motion-reveal">
<!-- wp:post-featured-image {"isLink":true,"width":"200px","height":"150px","className":"jv-post__image"} /-->
<!-- wp:group {"className":"jv-post__body","layout":{"type":"default"}} -->
<div class="wp-block-group jv-post__body">
<!-- wp:group {"className":"jv-post__meta","layout":{"type":"default"}} -->
<div class="wp-block-group jv-post__meta">
<!-- wp:post-date {"className":"jv-post__date"} /-->
<!-- wp:post-terms {"term":"post_tag","separator":"","className":"jv-tags"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-title {"level":4,"isLink":true,"className":"jv-post__title"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
