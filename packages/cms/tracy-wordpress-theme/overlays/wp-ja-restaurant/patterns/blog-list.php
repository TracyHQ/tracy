<?php
/**
 * Title: Article list
 * Slug: wp-ja-restaurant/blog-list
 * Description: The articles of a category, tag or the blog as rows (picture, title, details, intro) with the Joomla pager, for the archive templates.
 * Categories: wp-ja-restaurant, tracy
 * Inserter: no
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:query {"queryId":71,"query":{"inherit":true},"className":"tracy-query"} -->
<div class="wp-block-query tracy-query">
<!-- wp:post-template {"className":"blog"} -->
<!-- wp:wp-ja-restaurant/blog-item /-->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p><?php esc_html_e( 'There are no articles in this category.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pager tracy-joomla-pager","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
