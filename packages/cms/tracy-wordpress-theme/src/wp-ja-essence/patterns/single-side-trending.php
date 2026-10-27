<?php
/**
 * Title: Single article: Trending
 * Slug: wp-ja-essence/single-side-trending
 * Description: The Trending card of the single article template: the three articles of Blog with the fewest views.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: no
 * Keywords: posts, list, articles-category
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-sec je-side je-side--trend","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec je-side je-side--trend">
<!-- wp:group {"className":"je-sec__head je-sec__head--side","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec__head je-sec__head--side">
<!-- wp:heading {"level":2,"className":"je-sec__title","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<h2 class="wp-block-heading je-sec__title"><?php echo esc_html__( 'Trending', 'wp-ja-essence' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":25,"query":{"perPage":3,"pages":1,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false,"wpJaEssenceCategory":"blog","wpJaEssenceOrder":"hits"},"className":"je-side__list"} -->
<div class="wp-block-query je-side__list">
<!-- wp:post-template {"className":"je-side__items","layout":{"type":"default"}} -->
<!-- wp:group {"className":"je-mini","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini">
<!-- wp:post-featured-image {"isLink":true,"className":"je-mini__img"} /-->
<!-- wp:group {"className":"je-mini__body","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini__body">
<!-- wp:post-title {"level":4,"isLink":true,"className":"je-mini__title"} /-->
<!-- wp:group {"className":"je-mini__meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group je-mini__meta">
<!-- wp:post-date {"className":"je-meta__date"} /-->
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
