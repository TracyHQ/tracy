<?php
/**
 * Title: Event details and call to action
 * Slug: wp-ja-impact/event-aside
 * Description: The side column of an event (templates/single-event.html): its date, time, place, fee and tags, each under its label, and the call to action with its Get a quote button, which leads to the contact page. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"className":"jim-info","metadata":{"name":"article.event-info"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-info">
<!-- wp:group {"className":"jim-info__item","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jim-info__item"><!-- wp:group {"className":"jim-info__icon jim-info__icon--calendar","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__icon jim-info__icon--calendar"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__content"><!-- wp:paragraph {"className":"jim-info__label"} -->
<p class="jim-info__label"><?php echo esc_html__( 'Event date:', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-info__value","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gc","args":{"field":"event-date"}}}}} -->
<p class="jim-info__value"></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__item","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jim-info__item"><!-- wp:group {"className":"jim-info__icon jim-info__icon--clock","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__icon jim-info__icon--clock"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__content"><!-- wp:paragraph {"className":"jim-info__label"} -->
<p class="jim-info__label"><?php echo esc_html__( 'Event time:', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-info__value","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gc","args":{"field":"event-time"}}}}} -->
<p class="jim-info__value"></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__item","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jim-info__item"><!-- wp:group {"className":"jim-info__icon jim-info__icon--pin","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__icon jim-info__icon--pin"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__content"><!-- wp:paragraph {"className":"jim-info__label"} -->
<p class="jim-info__label"><?php echo esc_html__( 'Location:', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-info__value","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gc","args":{"field":"event-location"}}}}} -->
<p class="jim-info__value"></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__item","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jim-info__item"><!-- wp:group {"className":"jim-info__icon jim-info__icon--dollar","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__icon jim-info__icon--dollar"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__content"><!-- wp:paragraph {"className":"jim-info__label"} -->
<p class="jim-info__label"><?php echo esc_html__( 'Registration fee:', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-info__value","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gc","args":{"field":"event-fee"}}}}} -->
<p class="jim-info__value"></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__item","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group jim-info__item"><!-- wp:group {"className":"jim-info__icon jim-info__icon--tags","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__icon jim-info__icon--tags"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-info__content","layout":{"type":"default"}} -->
<div class="wp-block-group jim-info__content"><!-- wp:paragraph {"className":"jim-info__label"} -->
<p class="jim-info__label"><?php echo esc_html__( 'Category:', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:post-terms {"term":"post_tag","separator":", ","className":"jim-info__tags"} /--></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-cta","metadata":{"name":"article.event-cta"},"layout":{"type":"default"}} -->
<div class="wp-block-group jim-cta"><!-- wp:heading {"level":3,"className":"jim-cta__title"} -->
<h3 class="wp-block-heading jim-cta__title"><?php echo esc_html__( 'Join together for charity', 'wp-ja-impact' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jim-cta__desc"} -->
<p class="jim-cta__desc"><?php echo esc_html__( 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut elit tellus, luctus nec ullamcorper mattis, pulvinar dapibus leo.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"cta-action"} -->
<div class="wp-block-buttons cta-action"><!-- wp:button {"className":"jim-btn jim-btn--arrow"} -->
<div class="wp-block-button jim-btn jim-btn--arrow"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/contact/' ) ); ?>"><?php echo esc_html__( 'Get a quote', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons --></div>
<!-- /wp:group -->
