<?php
/**
 * Title: Blog listing, newest first
 * Slug: wp-ja-impact/gb-news
 * Description: A masonry grid of article cards (date, author, title; a picture when the article has one) with the Joomla pager, from a Query Loop. Newest first.
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: blog, articles, masonry, listing, pager
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm jim-gb jim-gb--news acm-articles-category style-news","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm jim-gb jim-gb--news acm-articles-category style-news">
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"jim-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jim-sec__head">
<!-- wp:heading {"level":3,"className":"jim-sec__sub","metadata":{"role":"content","name":"articles-category.sub-title"}} -->
<h3 class="wp-block-heading jim-sec__sub"><?php esc_html_e( 'Section label', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:heading {"className":"jim-sec__title","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<h2 class="wp-block-heading jim-sec__title"><?php esc_html_e( 'Section title', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":3401,"query":{"perPage":9,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactCategory":"animals"},"className":"jim-news-list"} -->
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
<!-- wp:post-title {"level":4,"isLink":true,"className":"jim-news__title"} /-->
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
