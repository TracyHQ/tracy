<?php
/**
 * Title: Events
 * Slug: wp-ja-impact/acm-events
 * Description: A label and a title, then the featured events as cards in two columns: a dated card over a picture, a highlighted card with its picture below, and a coloured card (Joomla mod_articles_category with the events layout of JA Impact). The cards come from a Query Loop on the events category (featured posts) and print the posts' start-date, event-location, bg-content, bg-startdate, btn-type and btn-redirect-link fields.
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: events, calendar, cards, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-articles-category style-events","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-articles-category style-events">
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
<!-- wp:query {"queryId":3302,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"only","inherit":false,"wpJaImpactCategory":"events"},"className":"jim-evt-list"} -->
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
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
