<?php
/**
 * Title: Success stories carousel
 * Slug: wp-ja-vega/section-stories
 * Description: A section label and headline over a carousel of portfolio posts (the Joomla `mod_articles_category` slider): each slide a wide picture with a panel holding the category, the title and a "Learn More" link; dots below, nothing moves on its own. The posts come from a Query Loop on the portfolio category, ordered by title.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: portfolio, case studies, stories, carousel, slider, posts
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-stories-sec","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-stories-sec">
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal","metadata":{"role":"content","name":"articles-category.section-title"}} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php esc_html_e( 'Success stories', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php esc_html_e( 'Showcasing our expertise', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-stories tracy-motion-reveal","layout":{"type":"default"}} -->
<div class="wp-block-group jv-stories tracy-motion-reveal">
<!-- wp:query {"queryId":21,"query":{"perPage":4,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"title","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaVegaCategory":"portfolio"},"className":"tracy-motion-carousel tracy-motion-carousel--dots jv-carousel"} -->
<div class="wp-block-query tracy-motion-carousel tracy-motion-carousel--dots jv-carousel">
<!-- wp:post-template {"className":"tracy-motion-track"} -->
<!-- wp:group {"className":"jv-story","layout":{"type":"default"}} -->
<div class="wp-block-group jv-story">
<!-- wp:post-featured-image {"className":"jv-bg"} /-->
<!-- wp:group {"className":"jv-story__box","layout":{"type":"default"}} -->
<div class="wp-block-group jv-story__box">
<!-- wp:post-terms {"term":"category","className":"jv-eyebrow jv-story__category"} /-->
<!-- wp:post-title {"level":4,"isLink":true,"className":"jv-story__title"} /-->
<!-- wp:group {"className":"jv-story__info","layout":{"type":"default"}} -->
<div class="wp-block-group jv-story__info">
<!-- wp:group {"className":"jv-story__info-row","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jv-story__info-row">
<!-- wp:paragraph {"className":"jv-story__info-label"} -->
<p class="jv-story__info-label"><?php esc_html_e( 'Client:', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-story__info-value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"jv_client"}}}}} -->
<p class="jv-story__info-value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-story__info-row","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jv-story__info-row">
<!-- wp:paragraph {"className":"jv-story__info-label"} -->
<p class="jv-story__info-label"><?php esc_html_e( 'Date:', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-story__info-value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"jv_date"}}}}} -->
<p class="jv-story__info-value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-story__info-row","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jv-story__info-row">
<!-- wp:paragraph {"className":"jv-story__info-label"} -->
<p class="jv-story__info-label"><?php esc_html_e( 'Type:', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-story__info-value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"jv_type"}}}}} -->
<p class="jv-story__info-value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:read-more {"content":"<?php echo esc_attr__( 'Learn More', 'wp-ja-vega' ); ?>","className":"jv-story__more"} /-->
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
</section>
<!-- /wp:group -->
