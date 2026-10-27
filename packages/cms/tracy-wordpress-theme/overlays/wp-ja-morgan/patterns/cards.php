<?php
/**
 * Title: Cards
 * Slug: tracy/cards
 * Categories: query
 * Block Types: core/query
 * Description: The listing: a query loop of article cards — picture with the category over its lower edge, title, intro, author and date, and a read-more arrow. Used by the seeded listing pages (JA Morgan's category blog: two cards a row beside the sidebar).
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:query {"queryId":1,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query blog","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query blog">
<!-- wp:post-template {"className":"tracy-grid items-row","layout":{"type":"grid","columnCount":2}} -->
<!-- wp:group {"className":"tracy-card item","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card item">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"3/2","className":"tracy-card__media item-image"} /-->
<!-- wp:post-terms {"term":"category","className":"tracy-eyebrow category-name"} /-->
<!-- wp:post-title {"level":2,"isLink":true,"className":"tracy-card__title article-title"} /-->
<!-- wp:post-excerpt {"excerptLength":55,"className":"tracy-card__text article-intro"} /-->
<!-- wp:group {"className":"article-info","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group article-info">
<!-- wp:post-author-name {"className":"createdby"} /-->
<!-- wp:post-date {"className":"published"} /-->
</div>
<!-- /wp:group -->
<!-- wp:read-more {"content":"Read more …","className":"readmore"} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted"><?php esc_html_e( 'Nothing here yet.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pagination pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
