<?php
/**
 * Title: Featured articles listing
 * Slug: wp-ja-impact/gb-news-featured
 * Description: A masonry grid of article cards (date, author, title; a picture when the article has one) with the Joomla pager, from a Query Loop. Featured (sticky) articles, newest first.
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: blog, articles, masonry, listing, pager
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm jim-gb jim-gb--news jim-gb--featured acm-articles-category style-news","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm jim-gb jim-gb--news jim-gb--featured acm-articles-category style-news">
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:query {"queryId":3404,"query":{"perPage":9,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"only","inherit":false,"wpJaImpactOrder":"featured"},"className":"jim-news-list"} -->
<div class="wp-block-query jim-news-list">
<!-- wp:post-template {"className":"jim-news-grid"} -->
<!-- wp:group {"className":"jim-news__item","layout":{"type":"default"}} -->
<div class="wp-block-group jim-news__item">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"4/3","scale":"cover","className":"jim-news__image jim-gb-image"} /-->
<!-- wp:group {"className":"jim-news__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-news__content">
<!-- wp:group {"className":"jim-news__meta","layout":{"type":"default"}} -->
<div class="wp-block-group jim-news__meta">
<!-- wp:paragraph {"className":"jim-news__date","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gb","args":{"field":"published"}}}}} -->
<p class="jim-news__date"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-news__by","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gb","args":{"field":"byline"}}}}} -->
<p class="jim-news__by"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:post-title {"level":4,"isLink":true,"className":"jim-news__title","metadata":{"role":"content","name":"articles-category.title"}} -->
<h4 class="wp-block-post-title jim-news__title"></h4>
<!-- /wp:post-title -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-pagination {"className":"tracy-pagination tracy-joomla-pager jim-gb__pager","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
