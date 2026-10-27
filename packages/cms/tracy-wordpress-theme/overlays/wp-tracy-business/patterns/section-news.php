<?php
/**
 * Title: News
 * Slug: wp-tracy-business/section-news
 * Description: Heading and a "View all" link on one row, then the site's three latest posts (a Query Loop, newest first, sticky posts in their date order; with Polylang, the page language's posts): 16:9 featured image, date · category, linked title, excerpt, "Read more" link. The cards are the posts themselves — a post edited, added or removed shows here with nothing to copy. "View all", while its link is still "#", goes to the page language's posts page, and the band is left out of the page while there is no post to list (inc/extra.php). The home-page news band of the spec (type `news`); the news index itself is the `home` template.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: news, disclosures, cards, articles
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-news"} -->
<section class="wp-block-group wtb-section wtb-news">
<!-- wp:group {"className":"wtb-inner"} -->
<div class="wp-block-group wtb-inner">
<!-- wp:group {"className":"wtb-head wtb-head--row"} -->
<div class="wp-block-group wtb-head wtb-head--row">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"news.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Latest', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"wtb-heading","metadata":{"role":"content","name":"news.heading"}} -->
<h2 class="wp-block-heading wtb-heading"><?php esc_html_e( 'News & disclosures', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"news.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'Contract awards, engineering notes and safety milestones.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"wtb-actions"} -->
<div class="wp-block-buttons wtb-actions">
<!-- wp:button {"className":"is-style-link","metadata":{"role":"content","name":"news.cta.1"}} -->
<div class="wp-block-button is-style-link"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'View all →', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":5,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"ignore","inherit":false},"className":"wtb-news__query","metadata":{"name":"news.query"},"layout":{"type":"default"}} -->
<div class="wp-block-query wtb-news__query">
<!-- wp:post-template {"className":"wtb-news__grid","layout":{"type":"default"}} -->
<!-- wp:group {"className":"wtb-card wtb-news__item","layout":{"type":"default"}} -->
<div class="wp-block-group wtb-card wtb-news__item">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9","sizeSlug":"large","className":"wtb-card__media"} /-->
<!-- wp:group {"className":"wtb-card__meta","layout":{"type":"default"}} -->
<div class="wp-block-group wtb-card__meta">
<!-- wp:post-date {"format":"j M Y"} /-->
<!-- wp:post-terms {"term":"category","prefix":"· "} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-title {"level":3,"isLink":true,"className":"wtb-card__title"} /-->
<!-- wp:post-excerpt {"excerptLength":20,"className":"wtb-card__text"} /-->
<!-- wp:group {"className":"wtb-card__link","layout":{"type":"default"}} -->
<div class="wp-block-group wtb-card__link">
<!-- wp:read-more <?php echo serialize_block_attributes( array( 'content' => __( 'Read more →', 'wp-tracy-business' ) ) ); ?> /-->
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
