<?php
/**
 * Title: Donations listing
 * Slug: wp-ja-impact/gb-funds
 * Description: A grid of donation cards (picture, tag, place, title, excerpt, progress bar, raised and goal figures) with the Joomla pager, from a Query Loop on the donations category.
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: donations, funds, grid, progress, pager
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm jim-gb jim-gb--funds acm-articles-category style-funds","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm jim-gb jim-gb--funds acm-articles-category style-funds">
<!-- wp:group {"className":"jim-container","layout":{"type":"default"}} -->
<div class="wp-block-group jim-container">
<!-- wp:group {"className":"jim-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jim-sec__head">
<!-- wp:heading {"level":3,"className":"jim-sec__sub","metadata":{"role":"content","name":"articles-category.sub-title"}} -->
<h3 class="wp-block-heading jim-sec__sub"><?php esc_html_e( 'Section label', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:heading {"className":"jim-sec__title","metadata":{"role":"content","name":"articles-category.main-section"}} -->
<h2 class="wp-block-heading jim-sec__title"><?php esc_html_e( 'Section title', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":3405,"query":{"perPage":9,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactCategory":"donations"},"className":"jim-fund-list jim-fund-page"} -->
<div class="wp-block-query jim-fund-list jim-fund-page">
<!-- wp:post-template {"className":"jim-fund-grid"} -->
<!-- wp:group {"className":"jim-fund","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"4/5","scale":"cover","className":"jim-fund__image jim-gb-image"} /-->
<!-- wp:group {"className":"jim-fund__info","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__info">
<!-- wp:group {"className":"jim-fund__top","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__top">
<!-- wp:group {"className":"jim-fund__meta","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__meta">
<!-- wp:post-terms {"term":"post_tag","className":"jim-fund__tag"} /-->
<!-- wp:paragraph {"className":"jim-fund__place","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"location"}}}}} -->
<p class="jim-fund__place"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:post-title {"level":3,"isLink":true,"className":"jim-fund__title"} /-->
<!-- wp:post-excerpt {"excerptLength":30,"moreText":"","className":"jim-fund__intro"} /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-fund__bottom","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__bottom">
<!-- wp:group {"className":"jim-fund__bar","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__bar">
<!-- wp:paragraph {"className":"jim-fund__pct","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"percent"}}}}} -->
<p class="jim-fund__pct"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jim-fund__track","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__track">
<!-- wp:group {"className":"jim-fund__fill","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__fill"></div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-fund__campaign","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__campaign">
<!-- wp:group {"className":"jim-fund__figure","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__figure">
<!-- wp:heading {"level":4,"className":"jim-fund__amount","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"raise"}}}}} -->
<h4 class="wp-block-heading jim-fund__amount"></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-fund__label"} -->
<p class="jim-fund__label"><?php esc_html_e( 'Raise', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-fund__figure","layout":{"type":"default"}} -->
<div class="wp-block-group jim-fund__figure">
<!-- wp:heading {"level":4,"className":"jim-fund__amount","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"goal"}}}}} -->
<h4 class="wp-block-heading jim-fund__amount"></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-fund__label"} -->
<p class="jim-fund__label"><?php esc_html_e( 'Goal', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-pagination {"className":"tracy-pagination tracy-joomla-pager jim-gb__pager","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
</section>
<!-- /wp:group -->
