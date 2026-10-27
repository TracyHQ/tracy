<?php
/**
 * Title: Tagged items
 * Slug: wp-ja-morgan/b-tagged-items
 * Description: The Tagged Items list of JA Morgan: the posts carrying the tag Morgan, two to a row, each a picture, a title and a short text.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: yes
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:query {"queryId":12,"query":{"perPage":20,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"title","inherit":false,"taxQuery":{"post_tag":[12]}},"className":"tracy-query blog tag-category","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query blog tag-category">
<!-- wp:post-template {"className":"tracy-grid cat-list","layout":{"type":"grid","columnCount":2}} -->
<!-- wp:group {"className":"item","layout":{"type":"default"}} -->
<div class="wp-block-group item">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"3/2","className":"item-image"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"article-title"} /-->
<!-- wp:post-excerpt {"excerptLength":24,"className":"tag-body","moreText":""} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
