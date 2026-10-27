<?php
/**
 * Title: Latest news
 * Slug: wp-ja-nova/section-news
 * Description: A section title, the three blog posts of the Joomla "News" list (mod_articles_category, grid layout) — the first one large, the next two beside it — each a picture with its date, title, author and category over it, and a button to the blog. The posts come from a Query Loop on the blog category, ordered by title.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: blog, news, posts, latest, articles
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-news","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-news">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'Latest news from us', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":71,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"title","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaNovaCategory":"blog"},"className":"jn-news__list"} -->
<div class="wp-block-query jn-news__list">
<!-- wp:post-template {"className":"jn-news__items"} -->
<!-- wp:group {"className":"jn-news__item","layout":{"type":"default"}} -->
<div class="wp-block-group jn-news__item">
<!-- wp:post-featured-image {"isLink":true,"className":"jn-news__image"} /-->
<!-- wp:group {"className":"jn-news__content","layout":{"type":"default"}} -->
<div class="wp-block-group jn-news__content">
<!-- wp:post-date {"className":"jn-news__date"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"jn-news__title"} /-->
<!-- wp:group {"className":"jn-news__info","layout":{"type":"default"}} -->
<div class="wp-block-group jn-news__info">
<!-- wp:post-author-name {"className":"jn-news__author"} /-->
<!-- wp:post-terms {"term":"category","className":"jn-news__cat"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-excerpt {"excerptLength":14,"className":"jn-news__excerpt","moreText":""} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
<!-- wp:group {"className":"jn-sec__foot","metadata":{"name":"articles-category.foot"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__foot">
<!-- wp:buttons {"className":"jn-actions jn-actions--center"} -->
<div class="wp-block-buttons jn-actions jn-actions--center">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"articles-category.title-btn"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'View all our news', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
