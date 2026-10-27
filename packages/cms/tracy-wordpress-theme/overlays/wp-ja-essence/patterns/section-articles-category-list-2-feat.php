<?php
/**
 * Title: Post row (feat)
 * Slug: wp-ja-essence/section-articles-category-list-2-feat
 * Description: A row of three small posts: picture on the left, title and date on the right.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: posts, list, articles-category
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-sec je-sec--minirow","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec je-sec--minirow">
<!-- wp:group {"className":"je-sec__head je-sec__head--hidden","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec__head je-sec__head--hidden">
<!-- wp:heading {"level":2,"className":"je-sec__title","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<h2 class="wp-block-heading je-sec__title"></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"je-sec__desc","metadata":{"role":"content","name":"articles-category.bottom-desc"}} -->
<p class="je-sec__desc"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":22,"query":{"perPage":3,"pages":1,"offset":0,"postType":"post","order":"asc","orderBy":"title","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false,"wpJaEssenceCategory":"blog-health,blog-design,blog-fashion","wpJaEssenceOrder":"title"},"className":"je-minirow"} -->
<div class="wp-block-query je-minirow">
<!-- wp:post-template {"className":"je-minirow__items","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"je-mini","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini">
<!-- wp:post-featured-image {"isLink":true,"className":"je-mini__img"} /-->
<!-- wp:group {"className":"je-mini__body","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini__body">
<!-- wp:post-title {"level":4,"isLink":true,"className":"je-mini__title"} /-->
<!-- wp:post-date {"className":"je-meta__date"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
