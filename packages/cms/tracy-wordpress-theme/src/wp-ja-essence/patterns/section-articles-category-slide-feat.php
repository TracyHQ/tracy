<?php
/**
 * Title: Lead slider (feat)
 * Slug: wp-ja-essence/section-articles-category-slide-feat
 * Description: The row of picture cards at the top of a page: category, title and byline over each post's picture, scrolling sideways. The posts are the feat categories, by title.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: posts, list, articles-category
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-sec je-sec--slide","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec je-sec--slide">
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
<!-- wp:query {"queryId":20,"query":{"perPage":6,"pages":1,"offset":0,"postType":"post","order":"asc","orderBy":"title","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false,"wpJaEssenceCategory":"blog-health,blog-design,blog-fashion","wpJaEssenceOrder":"title"},"className":"je-lead je-lead--slide"} -->
<div class="wp-block-query je-lead je-lead--slide">
<!-- wp:post-template {"className":"je-lead__items","layout":{"type":"default"}} -->
<!-- wp:cover {"useFeaturedImage":true,"dimRatio":50,"minHeight":362,"isDark":true,"className":"je-lead__card","layout":{"type":"constrained"}} -->
<div class="wp-block-cover is-light je-lead__card"><span aria-hidden="true" class="wp-block-cover__background has-background-dim"></span><div class="wp-block-cover__inner-container">
<!-- wp:post-terms {"term":"category","className":"je-badge"} /-->
<!-- wp:post-title {"textAlign":"center","level":3,"isLink":true,"className":"je-lead__title"} /-->
<!-- wp:group {"className":"je-meta je-meta--center","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"center"}} -->
<div class="wp-block-group je-meta je-meta--center">
<!-- wp:post-author-name {"isLink":false,"prefix":"By ","className":"je-meta__author"} /-->
<!-- wp:post-date {"className":"je-meta__date"} /-->
</div>
<!-- /wp:group -->
</div></div>
<!-- /wp:cover -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
