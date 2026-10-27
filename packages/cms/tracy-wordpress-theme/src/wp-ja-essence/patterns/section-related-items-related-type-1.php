<?php
/**
 * Title: More reading
 * Slug: wp-ja-essence/section-related-items-related-type-1
 * Description: A section title and three cards: picture, category, title and date.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: posts, list, related-items
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-sec je-sec--more","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec je-sec--more">
<!-- wp:group {"className":"je-sec__head je-sec__head--plain","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec__head je-sec__head--plain">
<!-- wp:heading {"level":2,"className":"je-sec__title","metadata":{"role":"content","name":"related-items.main-section"}} -->
<h2 class="wp-block-heading je-sec__title"></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"je-sec__desc","metadata":{"role":"content","name":"related-items.bottom-desc"}} -->
<p class="je-sec__desc"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":30,"query":{"perPage":3,"pages":1,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false,"wpJaEssenceOthers":true},"className":"je-more"} -->
<div class="wp-block-query je-more">
<!-- wp:post-template {"className":"je-more__items je-more__items--cards","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"je-relcard","layout":{"type":"default"}} -->
<div class="wp-block-group je-relcard">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"3/2","className":"je-relcard__img"} /-->
<!-- wp:post-terms {"term":"category","className":"je-badge"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"je-relcard__title"} /-->
<!-- wp:group {"className":"je-relcard__meta","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"center"}} -->
<div class="wp-block-group je-relcard__meta">
<!-- wp:post-date {"className":"je-meta__date"} /-->
<!-- wp:wp-ja-essence/hits /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
