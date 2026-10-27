<?php
/**
 * Title: Category chips
 * Slug: wp-ja-essence/section-articles-categories-slide
 * Description: A row of picture tiles, one per sub-category, with the name and post count over the picture (the Categories block drawn as the source's picture row; DECISIONS D-11, revised in 1.0.3).
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: categories, slider
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-sec je-sec--cats","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec je-sec--cats">
<!-- wp:heading {"level":2,"className":"je-sec__title screen-reader-text","metadata":{"role":"content","name":"articles-categories.main-section"}} -->
<h2 class="wp-block-heading je-sec__title screen-reader-text">Categories</h2>
<!-- /wp:heading -->
<!-- wp:categories {"showPostCounts":true,"className":"je-catrow je-cattiles"} /-->
</div>
<!-- /wp:group -->
