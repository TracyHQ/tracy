<?php
/**
 * Title: Latest news
 * Slug: wp-ja-diner/acm-latest-news-default
 * Description: A title, a sub-heading and the four newest posts as picture cards (Joomla ACM latest-news of JA Diner). The cards are a Query Loop: the posts are the content.
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: news, blog, latest, acm
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:group {"className":"t3-section module padding-top","metadata":{"name":"latest-news.root"}} -->
<div class="wp-block-group t3-section module padding-top">
<!-- wp:group {"className":"container"} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"module-inner"} -->
<div class="wp-block-group module-inner">
<!-- wp:heading {"level":2,"className":"section-title","metadata":{"role":"content","name":"latest-news.module-title"}} -->
<h2 class="wp-block-heading section-title"><?php esc_html_e( 'News & Events.', 'wp-ja-diner' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"section-sub h2","metadata":{"role":"content","name":"latest-news.sub-heading"}} -->
<p class="section-sub h2"><?php esc_html_e( 'A sentence about the news.', 'wp-ja-diner' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"module-ct"} -->
<div class="wp-block-group module-ct">
<!-- wp:query {"queryId":103,"query":{"perPage":4,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false,"taxQuery":{"category":[]}},"className":"latestnews list tracy-motion-carousel tracy-motion-carousel--dots","metadata":{"name":"latest-news.query"}} -->
<div class="wp-block-query latestnews list tracy-motion-carousel tracy-motion-carousel--dots">
<!-- wp:post-template {"className":"jd-news-items"} -->
<!-- wp:group {"className":"item"} -->
<div class="wp-block-group item">
<!-- wp:group {"className":"item-wrap"} -->
<div class="wp-block-group item-wrap">
<!-- wp:post-featured-image {"isLink":true,"className":"image-wrap"} /-->
<!-- wp:post-date {"format":"d.m.Y","className":"create"} /-->
<!-- wp:post-title {"level":3,"isLink":true} /-->
<!-- wp:post-excerpt {"excerptLength":55,"className":"intro"} /-->
<!-- wp:read-more {"content":"Read More","className":"action"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
