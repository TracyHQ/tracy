<?php
/**
 * Title: Cards
 * Slug: tracy/cards
 * Categories: query
 * Block Types: core/query
 * Description: The listing: a query loop of cards — image, kind (excerpt), name (title). Used by the blog and archive templates.
 *
 * @package tracy
 */
?>
<!-- wp:query {"queryId":1,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query">
<!-- wp:post-template {"className":"tracy-grid","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"tracy-card","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"4/3","className":"tracy-card__media"} /-->
<!-- wp:group {"className":"tracy-card__body","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card__body">
<!-- wp:post-terms {"term":"category","className":"tracy-eyebrow"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"tracy-card__title"} /-->
<!-- wp:post-excerpt {"excerptLength":24,"className":"tracy-card__text"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted">Nothing here yet.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
