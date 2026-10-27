<?php
/**
 * Title: Editor's choice (feat)
 * Slug: wp-ja-essence/section-articles-category-horizontal-feat
 * Description: A centred section title with its caption, then three vertical post cards: picture, category, title and byline.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: posts, list, articles-category
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-sec je-sec--choice","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec je-sec--choice">
<!-- wp:group {"className":"je-sec__head je-sec__head--center","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec__head je-sec__head--center">
<!-- wp:heading {"level":2,"className":"je-sec__title","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<h2 class="wp-block-heading je-sec__title"></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"je-sec__desc","metadata":{"role":"content","name":"articles-category.bottom-desc"}} -->
<p class="je-sec__desc"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":24,"query":{"perPage":3,"pages":1,"offset":0,"postType":"post","order":"asc","orderBy":"title","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false,"wpJaEssenceCategory":"blog-health,blog-design,blog-fashion","wpJaEssenceOrder":"title"},"className":"je-choice"} -->
<div class="wp-block-query je-choice">
<!-- wp:post-template {"className":"je-choice__items","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"je-vcard","layout":{"type":"default"}} -->
<div class="wp-block-group je-vcard">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/10","className":"je-vcard__img"} /-->
<!-- wp:post-terms {"term":"category","className":"je-badge"} /-->
<!-- wp:post-title {"level":4,"isLink":true,"className":"je-vcard__title"} /-->
<!-- wp:group {"className":"je-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group je-meta">
<!-- wp:post-author-name {"isLink":false,"prefix":"By ","className":"je-meta__author"} /-->
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
