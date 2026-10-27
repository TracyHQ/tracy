<?php
/**
 * Title: Cards
 * Slug: tracy/cards
 * Categories: query
 * Block Types: core/query
 * Description: The listing: a query loop of article cards — picture, category badge, title and byline, no intro except on the blog-layout page (the other Joomla category views print none; CSS hides .je-card__extra there). Used by the seeded listing pages.
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:query {"queryId":1,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query">
<!-- wp:post-template {"className":"tracy-grid","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"tracy-card","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card">
<!-- wp:group {"className":"tracy-card__media je-card__media","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card__media je-card__media">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"3/2","className":"je-card__img"} /-->
<!-- wp:wp-ja-essence/media-icon /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card__body","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card__body">
<!-- wp:post-terms {"term":"category","className":"tracy-eyebrow"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"tracy-card__title"} /-->
<!-- wp:group {"className":"je-meta","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"center"}} -->
<div class="wp-block-group je-meta">
<!-- wp:post-author-name {"isLink":false,"prefix":"By ","className":"je-meta__author"} /-->
<!-- wp:post-date {"className":"je-meta__date"} /-->
<!-- wp:wp-ja-essence/hits {"label":true} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"je-card__extra","layout":{"type":"default"}} -->
<div class="wp-block-group je-card__extra">
<!-- wp:post-excerpt {"excerptLength":40,"moreText":"","className":"je-card__intro"} /-->
<!-- wp:post-terms {"term":"post_tag","className":"je-card__tags"} /-->
<!-- wp:read-more {"content":"Read more ...","className":"je-card__more"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted"><?php esc_html_e( 'Nothing here yet.', 'wp-ja-essence' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
