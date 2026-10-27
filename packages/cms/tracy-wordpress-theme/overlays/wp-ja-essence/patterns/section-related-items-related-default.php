<?php
/**
 * Title: More reading
 * Slug: wp-ja-essence/section-related-items-related-default
 * Description: A section title and two columns of small posts: picture, title and views.
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
<!-- wp:query {"queryId":29,"query":{"perPage":4,"pages":1,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false,"wpJaEssenceOthers":true},"className":"je-more"} -->
<div class="wp-block-query je-more">
<!-- wp:post-template {"className":"je-more__items","layout":{"type":"grid","columnCount":2}} -->
<!-- wp:group {"className":"je-mini je-mini--wide","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini je-mini--wide">
<!-- wp:post-featured-image {"isLink":true,"className":"je-mini__img"} /-->
<!-- wp:group {"className":"je-mini__body","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini__body">
<!-- wp:post-title {"level":4,"isLink":true,"className":"je-mini__title"} /-->
<!-- wp:group {"className":"je-mini__meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group je-mini__meta">
<!-- wp:wp-ja-essence/hits /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
