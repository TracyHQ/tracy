<?php
/**
 * Title: Donation progress
 * Slug: wp-ja-impact/donation-progress
 * Description: The progress of a donation (templates/single-donation.html): the share raised as a bar, then the amount raised and the goal, each under its label (the wp-ja-impact/gc binding fills the numbers). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-impact
 * Inserter: no
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"className":"jim-prog","layout":{"type":"default"}} -->
<div class="wp-block-group jim-prog"><!-- wp:group {"className":"jim-prog__bar","layout":{"type":"default"}} -->
<div class="wp-block-group jim-prog__bar"><!-- wp:paragraph {"className":"jim-prog__pct","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gc","args":{"field":"percent"}}}}} -->
<p class="jim-prog__pct"></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jim-prog__track","layout":{"type":"default"}} -->
<div class="wp-block-group jim-prog__track"><!-- wp:group {"className":"jim-prog__fill","layout":{"type":"default"}} -->
<div class="wp-block-group jim-prog__fill"></div>
<!-- /wp:group --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-prog__nums","layout":{"type":"flex","flexWrap":"nowrap","justifyContent":"space-between"}} -->
<div class="wp-block-group jim-prog__nums"><!-- wp:group {"className":"jim-prog__num","layout":{"type":"default"}} -->
<div class="wp-block-group jim-prog__num"><!-- wp:paragraph {"className":"jim-prog__value","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gc","args":{"field":"raise"}}}}} -->
<p class="jim-prog__value"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-prog__label"} -->
<p class="jim-prog__label"><?php echo esc_html__( 'Raise', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
<!-- wp:group {"className":"jim-prog__num","layout":{"type":"default"}} -->
<div class="wp-block-group jim-prog__num"><!-- wp:paragraph {"className":"jim-prog__value","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gc","args":{"field":"goal"}}}}} -->
<p class="jim-prog__value"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-prog__label"} -->
<p class="jim-prog__label"><?php echo esc_html__( 'Goal', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
