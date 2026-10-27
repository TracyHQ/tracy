<?php
/**
 * Title: Related posts
 * Slug: wp-ja-impact/acm-related
 * Description: A label and a title, then the posts sharing the current post's category as cards in three columns, each a picture, its date and its title (Joomla mod_related_items after an article). The posts come from a Query Loop.
 * Categories: wp-ja-impact
 * Post Types: page, post
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: related, posts, articles, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-related-items style-default","metadata":{"name":"related-items.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-related-items style-default">
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"jim-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jim-sec__head">
<!-- wp:heading {"level":3,"className":"jim-sec__sub","metadata":{"role":"content","name":"related-items.sub-title"}} -->
<h3 class="wp-block-heading jim-sec__sub"><?php esc_html_e( 'Section label', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:heading {"className":"jim-sec__title","metadata":{"role":"content","name":"related-items.main-section"}} -->
<h2 class="wp-block-heading jim-sec__title"><?php esc_html_e( 'Section title', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":3304,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactRelated":true},"className":"jim-rel-list"} -->
<div class="wp-block-query jim-rel-list">
<!-- wp:post-template {"className":"jim-rel-grid"} -->
<!-- wp:group {"className":"jim-rel__item","layout":{"type":"default"}} -->
<div class="wp-block-group jim-rel__item">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"4/3","scale":"cover","className":"jim-rel__image"} /-->
<!-- wp:group {"className":"jim-rel__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-rel__content">
<!-- wp:paragraph {"className":"jim-rel__date","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"created"}}}}} -->
<p class="jim-rel__date"></p>
<!-- /wp:paragraph -->
<!-- wp:post-title {"level":4,"isLink":true,"className":"jim-rel__title"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
