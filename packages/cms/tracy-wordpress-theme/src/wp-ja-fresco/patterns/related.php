<?php
/**
 * Title: Related posts
 * Slug: wp-ja-fresco/related
 * Description: Three posts from the same category under a section title and lead, below an article (the source's mod_related_items, drawn by the related part).
 * Categories: wp-ja-fresco, tracy
 * Viewport Width: 1440
 * Inserter: no
 * Keywords: related, posts, articles
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"className":"t4-mod-wrap top-blank bottom-large jf-related","metadata":{"name":"single.related"},"layout":{"type":"default"}} -->
<div class="wp-block-group t4-mod-wrap top-blank bottom-large jf-related">
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"section-title-wrap","layout":{"type":"default"}} -->
<div class="wp-block-group section-title-wrap">
<!-- wp:paragraph {"className":"main-title h1","metadata":{"name":"related.main-section"}} -->
<p class="main-title h1"><?php esc_html_e( 'Related Posts', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"section-top-desc lead","metadata":{"name":"related.top-desc"}} -->
<p class="section-top-desc lead"><?php esc_html_e( 'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\'s standard dummy text ever since the 1500s...', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":71,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"jfRelated":true},"className":"relateditems"} -->
<div class="wp-block-query relateditems">
<!-- wp:post-template {"layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"item-inner","layout":{"type":"default"}} -->
<div class="wp-block-group item-inner">
<!-- wp:post-featured-image {"isLink":true,"className":"item-image"} /-->
<!-- wp:group {"className":"content-info","layout":{"type":"default"}} -->
<div class="wp-block-group content-info">
<!-- wp:post-terms {"term":"category","className":"category-name"} /-->
<!-- wp:post-title {"level":4,"isLink":true,"className":"item-title"} /-->
<!-- wp:post-date {"className":"item-date"} /-->
<!-- wp:post-excerpt {"excerptLength":100,"className":"item-desc"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
