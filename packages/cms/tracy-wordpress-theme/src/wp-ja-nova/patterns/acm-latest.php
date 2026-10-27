<?php
/**
 * Title: Latest blog posts
 * Slug: wp-ja-nova/section-latest
 * Description: A section title and the four latest blog posts (Joomla mod_articles_latest, type-1 layout): the first one large with its picture, the next three as boxes beside it, each with its date, title and a short intro. The posts come from a Query Loop on the blog category, newest first.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: blog, news, posts, latest, articles
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-latest top-large bottom-medium","metadata":{"name":"articles-latest.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-latest top-large bottom-medium">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"articles-latest.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'Latest news from us', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":73,"query":{"perPage":4,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaNovaCategory":"blog"},"className":"jn-latest__list"} -->
<div class="wp-block-query jn-latest__list">
<!-- wp:post-template {"className":"jn-latest__items"} -->
<!-- wp:group {"className":"jn-latest__item","layout":{"type":"default"}} -->
<div class="wp-block-group jn-latest__item">
<!-- wp:post-featured-image {"className":"jn-latest__image"} /-->
<!-- wp:group {"className":"jn-latest__content","layout":{"type":"default"}} -->
<div class="wp-block-group jn-latest__content">
<!-- wp:post-date {"className":"jn-latest__date"} /-->
<!-- wp:post-title {"level":4,"isLink":true,"className":"jn-latest__title"} /-->
<!-- wp:post-excerpt {"excerptLength":30,"className":"jn-latest__excerpt","moreText":""} /-->
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
