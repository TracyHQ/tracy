<?php
/**
 * Title: Lead slider
 * Slug: wp-ja-essence/lead-slider
 * Description: The row of three picture cards at the top of the home page: category, title and byline over the post's picture.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: lead, hero, slider
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:query {"queryId":2,"query":{"perPage":3,"pages":1,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":false,"sticky":"ignore"},"className":"je-lead","metadata":{"name":"lead.query"}} -->
<div class="wp-block-query je-lead">
<!-- wp:post-template {"className":"je-lead__items","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:cover {"useFeaturedImage":true,"dimRatio":50,"minHeight":362,"isDark":true,"className":"je-lead__card","layout":{"type":"constrained"}} -->
<div class="wp-block-cover is-light je-lead__card"><span aria-hidden="true" class="wp-block-cover__background has-background-dim"></span><div class="wp-block-cover__inner-container">
<!-- wp:post-terms {"term":"category","className":"je-badge"} /-->
<!-- wp:post-title {"textAlign":"center","level":3,"isLink":true,"className":"je-lead__title"} /-->
<!-- wp:group {"className":"je-meta","layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-group je-meta">
<!-- wp:post-author-name {"prefix":"By ","className":"je-meta__author"} /-->
<!-- wp:post-date {"className":"je-meta__date"} /-->
</div>
<!-- /wp:group -->
</div></div>
<!-- /wp:cover -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
