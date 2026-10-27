<?php
/**
 * Title: Services
 * Slug: wp-tracy-business/section-services
 * Description: Warm band: eyebrow, heading and a link-style button on one row, then four numbered cards under a 1px top rule. The number is the item meta; a card without one is numbered by CSS. Every spec section of type `services`.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: services, cards, numbered, what we do
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-services"} -->
<section class="wp-block-group wtb-section wtb-services">
<!-- wp:group {"className":"wtb-inner"} -->
<div class="wp-block-group wtb-inner">
<!-- wp:group {"className":"wtb-head wtb-head--row"} -->
<div class="wp-block-group wtb-head wtb-head--row">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"services.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'What we do', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"wtb-heading","metadata":{"role":"content","name":"services.heading"}} -->
<h2 class="wp-block-heading wtb-heading"><?php esc_html_e( 'Four core service lines', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"services.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'One contract, one schedule and one accountable party — from site investigation to final acceptance.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"wtb-actions"} -->
<div class="wp-block-buttons wtb-actions">
<!-- wp:button {"className":"is-style-link","metadata":{"role":"content","name":"services.cta.1"}} -->
<div class="wp-block-button is-style-link"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'All services →', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-services__grid"} -->
<div class="wp-block-group wtb-services__grid">
<!-- wp:group {"className":"wtb-services__item","metadata":{"name":"services.item.1"}} -->
<div class="wp-block-group wtb-services__item">
<!-- wp:paragraph {"className":"wtb-services__num","metadata":{"role":"content","name":"services.item.1.meta"}} -->
<p class="wtb-services__num"><?php esc_html_e( '01', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"services.item.1.title"}} -->
<h3 class="wp-block-heading wtb-card__title"><?php esc_html_e( 'Industrial park infrastructure', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-card__text","metadata":{"role":"content","name":"services.item.1.text"}} -->
<p class="wtb-card__text"><?php esc_html_e( 'Earthworks, internal roads, water supply and wastewater treatment, turnkey.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-card__link","metadata":{"role":"content","name":"services.item.1.href"}} -->
<p class="wtb-card__link"><a href="#"><?php esc_html_e( 'Learn more →', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-services__item","metadata":{"name":"services.item.2"}} -->
<div class="wp-block-group wtb-services__item">
<!-- wp:paragraph {"className":"wtb-services__num","metadata":{"role":"content","name":"services.item.2.meta"}} -->
<p class="wtb-services__num"><?php esc_html_e( '02', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"services.item.2.title"}} -->
<h3 class="wp-block-heading wtb-card__title"><?php esc_html_e( 'Pre-engineered buildings', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-card__text","metadata":{"role":"content","name":"services.item.2.text"}} -->
<p class="wtb-card__text"><?php esc_html_e( 'Structural design, fabrication and erection of steel frames spanning up to 45 m.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-card__link","metadata":{"role":"content","name":"services.item.2.href"}} -->
<p class="wtb-card__link"><a href="#"><?php esc_html_e( 'Learn more →', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-services__item","metadata":{"name":"services.item.3"}} -->
<div class="wp-block-group wtb-services__item">
<!-- wp:paragraph {"className":"wtb-services__num","metadata":{"role":"content","name":"services.item.3.meta"}} -->
<p class="wtb-services__num"><?php esc_html_e( '03', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"services.item.3.title"}} -->
<h3 class="wp-block-heading wtb-card__title"><?php esc_html_e( 'M&E engineering', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-card__text","metadata":{"role":"content","name":"services.item.3.text"}} -->
<p class="wtb-card__text"><?php esc_html_e( 'Substations, compressed air, HVAC and fire protection to NFPA standards.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-card__link","metadata":{"role":"content","name":"services.item.3.href"}} -->
<p class="wtb-card__link"><a href="#"><?php esc_html_e( 'Learn more →', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-services__item","metadata":{"name":"services.item.4"}} -->
<div class="wp-block-group wtb-services__item">
<!-- wp:paragraph {"className":"wtb-services__num","metadata":{"role":"content","name":"services.item.4.meta"}} -->
<p class="wtb-services__num"><?php esc_html_e( '04', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"services.item.4.title"}} -->
<h3 class="wp-block-heading wtb-card__title"><?php esc_html_e( 'Maintenance & retrofit', 'wp-tracy-business' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-card__text","metadata":{"role":"content","name":"services.item.4.text"}} -->
<p class="wtb-card__text"><?php esc_html_e( 'Long-term maintenance contracts and capacity upgrades on live production lines.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-card__link","metadata":{"role":"content","name":"services.item.4.href"}} -->
<p class="wtb-card__link"><a href="#"><?php esc_html_e( 'Learn more →', 'wp-tracy-business' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
