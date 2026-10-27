<?php
/**
 * Title: Front list (warm cards)
 * Slug: wp-ja-essence/front-list-warm
 * Description: The blog list: one warm-tinted card per post with its picture, category, title, byline, excerpt and a read-more link, then the pager.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: posts, blog, list
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:query {"queryId":5,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":false,"sticky":"ignore"},"className":"je-list je-list--warm","metadata":{"name":"postlist.query"}} -->
<div class="wp-block-query je-list je-list--warm">
<!-- wp:post-template {"className":"je-list__items","layout":{"type":"default"}} -->
<!-- wp:group {"className":"je-card","layout":{"type":"default"}} -->
<div class="wp-block-group je-card">
<!-- wp:group {"className":"je-card__media","layout":{"type":"default"}} -->
<div class="wp-block-group je-card__media">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"auto","className":"je-card__img"} /-->
<!-- wp:wp-ja-essence/media-icon /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"je-card__body","layout":{"type":"default"}} -->
<div class="wp-block-group je-card__body">
<!-- wp:post-terms {"term":"category","className":"je-badge"} /-->
<!-- wp:post-title {"level":2,"isLink":true,"className":"je-card__title"} /-->
<!-- wp:group {"className":"je-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group je-meta">
<!-- wp:post-author-name {"isLink":false,"prefix":"By ","className":"je-meta__author"} /-->
<!-- wp:post-date {"className":"je-meta__date"} /-->
<!-- wp:wp-ja-essence/hits {"label":true} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:post-excerpt {"moreText":"Read more ...","excerptLength":60,"className":"je-card__excerpt"} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-pagination {"paginationArrow":"chevron","showLabel":false,"className":"je-pager","layout":{"type":"flex","justifyContent":"center"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
