<?php
/**
 * Title: Pricing plans
 * Slug: wp-ja-nova/section-pricing
 * Description: A section title with a coloured phrase, the plan names as tabs on the left and the chosen plan on the right: its price, a line, a button and what it includes (Joomla ACM pricing style-1).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: pricing, plans, tabs, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-pricing","metadata":{"name":"pricing.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-pricing">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"pricing.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'A section title', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-pricing__body","layout":{"type":"default"}} -->
<div class="wp-block-group jn-pricing__body">
<!-- wp:group {"className":"jn-pricing__tabs","layout":{"type":"default"}} -->
<div class="wp-block-group jn-pricing__tabs">
<!-- wp:paragraph {"className":"jn-pricing__tab","metadata":{"role":"content","name":"pricing.title.1"}} -->
<p class="jn-pricing__tab"><?php esc_html_e( 'Basic Plan', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-pricing__panels","layout":{"type":"default"}} -->
<div class="wp-block-group jn-pricing__panels">
<!-- wp:group {"className":"jn-pricing__panel","metadata":{"name":"pricing.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-pricing__panel">
<!-- wp:group {"className":"jn-pricing__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-pricing__head">
<!-- wp:group {"className":"jn-pricing__title-wrap","layout":{"type":"default"}} -->
<div class="wp-block-group jn-pricing__title-wrap">
<!-- wp:paragraph {"className":"jn-pricing__price","metadata":{"role":"content","name":"pricing.price.1"}} -->
<p class="jn-pricing__price">$19.50</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jn-pricing__desc","metadata":{"role":"content","name":"pricing.desc.1"}} -->
<p class="jn-pricing__desc"><?php esc_html_e( 'Who the plan is for', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"jn-actions"} -->
<div class="wp-block-buttons jn-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"pricing.btn.1"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Choose now', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:list {"className":"jn-pricing__list","metadata":{"role":"content","name":"pricing.plan-list.1"}} -->
<ul class="wp-block-list jn-pricing__list"><!-- wp:list-item -->
<li><?php esc_html_e( 'What the plan includes', 'wp-ja-nova' ); ?></li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
