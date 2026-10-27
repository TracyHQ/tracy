<?php
/**
 * Title: Sidebar
 * Slug: wp-ja-morgan/part-sidebar
 * Description: The sidebar of articles, the search page and pages with a sidebar: login, the most read news, the categories and the popular tags, its headings in the site's language. Drawn by the sidebar template part.
 * Categories: wp-ja-morgan, tracy
 * Inserter: no
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"aside","className":"t3-sidebar","layout":{"type":"default"}} -->
<aside class="wp-block-group t3-sidebar">
<!-- wp:group {"className":"t3-module jm-login","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-login">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Login.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:loginout {"displayLoginAsForm":true} /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-mostread","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-mostread">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'News & Update.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:query {"queryId":64,"query":{"perPage":2,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":false,"jmOrder":"hits"},"className":"mostread"} -->
<div class="wp-block-query mostread">
<!-- wp:post-template -->
<!-- wp:post-featured-image {"isLink":true,"sizeSlug":"large","className":"mostread-image"} /-->
<!-- wp:post-title {"level":4,"isLink":true,"className":"mostread-title"} /-->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-categories","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-categories">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Categories.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:categories {"showPostCounts":true,"className":"categories-module"} /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-tags","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-tags">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Tags.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:tag-cloud {"smallestFontSize":"14px","largestFontSize":"14px","className":"tagspopular"} /-->
</div>
<!-- /wp:group -->
</aside>
<!-- /wp:group -->
