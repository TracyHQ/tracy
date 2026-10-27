<?php
/**
 * Title: Latest news
 * Slug: wp-ja-impact/acm-news
 * Description: A label and a title, the six latest posts of the blog category as cards in three columns (a picture, then the date, the author and the title; a post with a colour field is a solid card), and a button to the blog (Joomla mod_articles_category with the masonry layout of JA Impact). The posts come from a Query Loop.
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: news, blog, posts, latest, masonry, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-articles-category style-news","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-articles-category style-news">
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
<!-- wp:query {"queryId":3303,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactCategory":"animals"},"className":"jim-news-list"} -->
<div class="wp-block-query jim-news-list">
<!-- wp:post-template {"className":"jim-news-grid"} -->
<!-- wp:group {"className":"jim-news__item","layout":{"type":"default"}} -->
<div class="wp-block-group jim-news__item">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"4/3","scale":"cover","className":"jim-news__image jim-gb-image"} /-->
<!-- wp:group {"className":"jim-news__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-news__content">
<!-- wp:group {"className":"jim-news__meta","layout":{"type":"default"}} -->
<div class="wp-block-group jim-news__meta">
<!-- wp:paragraph {"className":"jim-news__date","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"created"}}}}} -->
<p class="jim-news__date"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jim-news__by","layout":{"type":"default"}} -->
<div class="wp-block-group jim-news__by">
<!-- wp:post-author-name {"className":"jim-news__author"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:post-title {"level":4,"isLink":true,"className":"jim-news__title"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
<!-- wp:group {"className":"jim-sec__foot","metadata":{"name":"articles-category.foot"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-sec__foot">
<!-- wp:buttons {"className":"jim-actions"} -->
<div class="wp-block-buttons jim-actions">
<!-- wp:button {"className":"jim-btn jim-btn--arrow","metadata":{"role":"content","name":"articles-category.title-btn"}} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'View all our blog', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
