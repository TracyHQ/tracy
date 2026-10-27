<?php
/**
 * Title: Cards
 * Slug: tracy/cards
 * Categories: query
 * Block Types: core/query
 * Description: The listing: a query loop of article cards — picture, the category over its lower edge, title, author with avatar and date, and the first lines of the intro. The first card of a page is the leading article, picture beside text. Used by the seeded listing pages (JA Fresco's category blog: one leading article, then three cards a row).
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:query {"queryId":1,"query":{"perPage":7,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query jf-blog blog","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query jf-blog blog">
<!-- wp:post-template {"className":"jf-blog-items","layout":{"type":"default"}} -->
<!-- wp:group {"className":"jf-blog-item item","layout":{"type":"default"}} -->
<div class="wp-block-group jf-blog-item item">
<!-- wp:post-featured-image {"isLink":true,"className":"item-image"} /-->
<!-- wp:group {"className":"item-content","layout":{"type":"default"}} -->
<div class="wp-block-group item-content">
<!-- wp:post-terms {"term":"category","className":"category-name"} /-->
<!-- wp:post-title {"level":2,"isLink":true,"className":"item-title"} /-->
<!-- wp:group {"className":"article-info","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group article-info">
<!-- wp:group {"className":"createdby","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group createdby">
<!-- wp:avatar {"size":24,"className":"author-avatar"} /-->
<!-- wp:paragraph {"className":"createdby-by"} -->
<p class="createdby-by"><?php esc_html_e( 'By', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:post-author-name {"isLink":true,"className":"author-name"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-date {"format":"j F Y","className":"published"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-excerpt {"excerptLength":200,"className":"item-intro"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted"><?php esc_html_e( 'Nothing here yet.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pagination pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
