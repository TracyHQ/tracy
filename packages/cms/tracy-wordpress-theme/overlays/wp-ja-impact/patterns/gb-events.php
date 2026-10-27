<?php
/**
 * Title: Events listing
 * Slug: wp-ja-impact/gb-events
 * Description: A two-column grid of event cards (date, place, title, intro, join button) with the Joomla pager, from a Query Loop on the events category.
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: events, grid, pager
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm jim-gb jim-gb--events acm-articles-category style-events","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm jim-gb jim-gb--events acm-articles-category style-events">
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
<!-- wp:query {"queryId":3406,"query":{"perPage":5,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactCategory":"events"},"className":"jim-evt-list"} -->
<div class="wp-block-query jim-evt-list">
<!-- wp:post-template {"className":"jim-evt-grid"} -->
<!-- wp:group {"className":"jim-evt","layout":{"type":"default"}} -->
<div class="wp-block-group jim-evt">
<!-- wp:post-featured-image {"isLink":true,"scale":"cover","className":"jim-evt__image jim-gb-image"} /-->
<!-- wp:group {"className":"jim-evt__body","layout":{"type":"default"}} -->
<div class="wp-block-group jim-evt__body">
<!-- wp:group {"className":"jim-evt__date","layout":{"type":"default"}} -->
<div class="wp-block-group jim-evt__date">
<!-- wp:heading {"level":3,"className":"jim-evt__day","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"event-day"}}}}} -->
<h3 class="wp-block-heading jim-evt__day"></h3>
<!-- /wp:heading -->
<!-- wp:heading {"level":6,"className":"jim-evt__month","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"event-month"}}}}} -->
<h6 class="wp-block-heading jim-evt__month"></h6>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-evt__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-evt__content">
<!-- wp:post-title {"level":3,"isLink":true,"className":"jim-evt__title"} /-->
<!-- wp:paragraph {"className":"jim-evt__place","metadata":{"bindings":{"content":{"source":"wp-ja-impact/post","args":{"field":"event-location"}}}}} -->
<p class="jim-evt__place"></p>
<!-- /wp:paragraph -->
<!-- wp:post-excerpt {"excerptLength":30,"moreText":"","className":"jim-evt__intro"} /-->
<!-- wp:buttons {"className":"jim-evt__actions"} -->
<div class="wp-block-buttons jim-evt__actions">
<!-- wp:button {"className":"jim-btn jim-btn--arrow jim-evt__btn","metadata":{"bindings":{"url":{"source":"wp-ja-impact/post","args":{"field":"event-link"}}}}} -->
<div class="wp-block-button jim-btn jim-btn--arrow jim-evt__btn"><a class="wp-block-button__link wp-element-button"><?php esc_html_e( 'Join our event', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
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
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
