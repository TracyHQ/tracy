<?php
/**
 * Title: Article sidebar
 * Slug: wp-ja-impact/gc-sidebar
 * Description: The sidebar of an article page: the categories with their post counts, a search field, the latest posts with their pictures and the popular tags (the Joomla modules Categories, Search, Recent posts and Tags). Every list is a core block.
 * Categories: wp-ja-impact
 * Post Types: post
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: sidebar, categories, recent posts, tags, article
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"className":"jim-side","metadata":{"name":"article.sidebar"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-side"><!-- wp:group {"className":"jim-side__box jim-side__cats","layout":{"type":"default"}} -->
<div class="wp-block-group jim-side__box jim-side__cats"><!-- wp:heading {"level":3,"className":"jim-side__title"} -->
<h3 class="wp-block-heading jim-side__title"><?php esc_html_e( 'Categories', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:categories {"showPostCounts":true,"className":"jim-side__list"} /--></div>
<!-- /wp:group -->
<!-- wp:search {"label":"Search","showLabel":false,"placeholder":"Search …","buttonText":"Search","buttonUseIcon":true,"buttonPosition":"button-inside","className":"jim-side__search"} /-->
<!-- wp:group {"className":"jim-side__box jim-side__recent","layout":{"type":"default"}} -->
<div class="wp-block-group jim-side__box jim-side__recent"><!-- wp:heading {"level":3,"className":"jim-side__title"} -->
<h3 class="wp-block-heading jim-side__title"><?php esc_html_e( 'Recent posts', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:query {"queryId":3360,"query":{"perPage":5,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactCategory":"animals"},"className":"jim-side__latest"} -->
<div class="wp-block-query jim-side__latest"><!-- wp:post-template {"className":"jim-side__latest-list"} -->
<!-- wp:group {"className":"jim-side__item","layout":{"type":"flex","flexWrap":"nowrap","verticalAlignment":"top"}} -->
<div class="wp-block-group jim-side__item"><!-- wp:post-featured-image {"isLink":true,"aspectRatio":"3/2","scale":"cover","width":"120px","height":"80px","className":"jim-side__thumb"} /-->
<!-- wp:post-title {"level":5,"isLink":true,"className":"jim-side__post"} /--></div>
<!-- /wp:group -->
<!-- /wp:post-template --></div>
<!-- /wp:query --></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-side__box jim-side__tags","layout":{"type":"default"}} -->
<div class="wp-block-group jim-side__box jim-side__tags"><!-- wp:heading {"level":3,"className":"jim-side__title"} -->
<h3 class="wp-block-heading jim-side__title"><?php esc_html_e( 'Tags', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:tag-cloud {"smallestFontSize":"14px","largestFontSize":"14px","className":"jim-side__cloud"} /--></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
