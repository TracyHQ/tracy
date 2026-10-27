<?php
/**
 * Title: Featured articles
 * Slug: wp-ja-morgan/b-featured-articles
 * Description: The Featured Articles blog of JA Morgan: the sticky (featured) posts as a three-column grid of cards, six a page.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: yes
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:query {"queryId":11,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":false,"sticky":"only"},"className":"tracy-query blog blog-featured","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query blog blog-featured">
<!-- wp:post-template {"className":"tracy-grid items-row cols-3","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"tracy-card item","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-card item">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"3/2","className":"tracy-card__media item-image"} /-->
<!-- wp:post-terms {"term":"category","className":"tracy-eyebrow category-name"} /-->
<!-- wp:post-title {"level":2,"isLink":true,"className":"tracy-card__title article-title"} /-->
<!-- wp:post-excerpt {"excerptLength":200,"className":"tracy-card__text article-intro","moreText":""} /-->
<!-- wp:post-terms {"term":"post_tag","separator":" ","className":"tags"} /-->
<!-- wp:group {"className":"article-info","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group article-info">
<!-- wp:post-author-name {"className":"createdby"} /-->
<!-- wp:post-date {"className":"published"} /-->
<!-- wp:paragraph {"className":"hits"} -->
<p class="hits">Hits: {jm-hits}</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:read-more {"content":"Read more …","className":"readmore"} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-pagination {"className":"tracy-pagination pagination tracy-joomla-pager","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
