<?php
/**
 * Title: Related posts
 * Slug: wp-ja-nova/section-related
 * Description: A section title and the posts sharing the most keywords with the current post, each a picture, its title and a line (Joomla mod_related_items after an article). The posts come from a Query Loop.
 * Categories: wp-ja-nova
 * Post Types: page, post
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: related, posts, articles
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-related bg-light top-large bottom-large","metadata":{"name":"related-items.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-related bg-light top-large bottom-large">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"related-items.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'Related Posts', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":81,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaNovaRelated":true},"className":"jn-related__list"} -->
<div class="wp-block-query jn-related__list">
<!-- wp:post-template {"className":"jn-related__items"} -->
<!-- wp:group {"className":"jn-related__item","layout":{"type":"default"}} -->
<div class="wp-block-group jn-related__item">
<!-- wp:post-featured-image {"isLink":true,"className":"jn-related__image"} /-->
<!-- wp:post-title {"level":4,"isLink":true,"className":"jn-related__title"} /-->
<!-- wp:post-excerpt {"excerptLength":20,"className":"jn-related__excerpt","moreText":""} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
