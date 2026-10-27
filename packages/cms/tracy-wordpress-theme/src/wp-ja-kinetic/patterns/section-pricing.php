<?php
/**
 * Title: Pricing plans
 * Slug: wp-ja-kinetic/section-pricing
 * Description: Ruled section head, a three-column plan-card grid where one card is marked most popular, and an "every plan includes" bar underneath. Every spec section of type `pricing`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: pricing, plans, tiers, cards, acm
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-pricing style-1"} -->
<section class="wp-block-group ja-acm acm-pricing style-1">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-pricing-head"} -->
<div class="wp-block-group hx-pricing-head">
<!-- wp:group {"className":"hx-sec-rule"} -->
<div class="wp-block-group hx-sec-rule"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-sec-headrow"} -->
<div class="wp-block-group hx-sec-headrow">
<!-- wp:group {"className":"hx-sec-headl"} -->
<div class="wp-block-group hx-sec-headl">
<!-- wp:paragraph {"className":"hx-sec-idx","metadata":{"role":"content","name":"pricing.eyebrow"}} -->
<p class="hx-sec-idx"><?php esc_html_e( '(01)', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"hx-h2","metadata":{"role":"content","name":"pricing.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'Plans', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-sec-meta","metadata":{"role":"content","name":"pricing.meta"}} -->
<p class="hx-sec-meta"><?php esc_html_e( '3 TIERS · NO SEAT FEES', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-cols hx-plans"} -->
<div class="wp-block-group hx-cols hx-plans">
<!-- wp:group {"className":"hx-card hx-card--lg hx-plan","metadata":{"name":"pricing.item.1"}} -->
<div class="wp-block-group hx-card hx-card--lg hx-plan">
<!-- wp:paragraph {"className":"hx-plan-name","metadata":{"role":"content","name":"pricing.name.1"}} -->
<p class="hx-plan-name"><?php esc_html_e( 'Free', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-plan-desc","metadata":{"role":"content","name":"pricing.desc.1"}} -->
<p class="hx-plan-desc"><?php esc_html_e( 'For side projects and first incidents.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-plan-price"} -->
<div class="wp-block-group hx-plan-price">
<!-- wp:paragraph {"className":"hx-plan-amount","metadata":{"role":"content","name":"pricing.price.1"}} -->
<p class="hx-plan-amount"><?php esc_html_e( '$0', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-plan-period","metadata":{"role":"content","name":"pricing.period.1"}} -->
<p class="hx-plan-period"><?php esc_html_e( '/forever', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"hx-btn hx-btn--ghost hx-plan-cta","metadata":{"role":"content","name":"pricing.cta_label.1"}} -->
<div class="wp-block-button hx-btn hx-btn--ghost hx-plan-cta"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( '/pages/register' ); ?>"><?php esc_html_e( 'Start free', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:list {"className":"hx-plan-features","metadata":{"role":"content","name":"pricing.features.1"}} -->
<ul class="wp-block-list hx-plan-features">
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( '5 GB ingest / mo', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( '7-day retention', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( '3 team members', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'KineticQL queries', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Community support', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-card--lg hx-plan is-popular","metadata":{"name":"pricing.item.2"}} -->
<div class="wp-block-group hx-card hx-card--lg hx-plan is-popular">
<!-- wp:paragraph {"className":"hx-plan-badge","metadata":{"role":"content","name":"pricing.popular.2"}} -->
<p class="hx-plan-badge"><?php esc_html_e( 'MOST POPULAR', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-plan-name","metadata":{"role":"content","name":"pricing.name.2"}} -->
<p class="hx-plan-name"><?php esc_html_e( 'Team', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-plan-desc","metadata":{"role":"content","name":"pricing.desc.2"}} -->
<p class="hx-plan-desc"><?php esc_html_e( 'For teams that carry a pager.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-plan-price"} -->
<div class="wp-block-group hx-plan-price">
<!-- wp:paragraph {"className":"hx-plan-amount","metadata":{"role":"content","name":"pricing.price.2"}} -->
<p class="hx-plan-amount"><?php esc_html_e( '$29', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-plan-period","metadata":{"role":"content","name":"pricing.period.2"}} -->
<p class="hx-plan-period"><?php esc_html_e( '/mo per host', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"hx-btn hx-btn--primary hx-plan-cta","metadata":{"role":"content","name":"pricing.cta_label.2"}} -->
<div class="wp-block-button hx-btn hx-btn--primary hx-plan-cta"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( '/pages/register' ); ?>"><?php esc_html_e( 'Start 14-day trial', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:list {"className":"hx-plan-features","metadata":{"role":"content","name":"pricing.features.2"}} -->
<ul class="wp-block-list hx-plan-features">
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Unlimited ingest', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( '30-day retention', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Unlimited members', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Smart alert routing', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Deploy-window suppression', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'SSO + audit log', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Priority support', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-card--lg hx-plan","metadata":{"name":"pricing.item.3"}} -->
<div class="wp-block-group hx-card hx-card--lg hx-plan">
<!-- wp:paragraph {"className":"hx-plan-name","metadata":{"role":"content","name":"pricing.name.3"}} -->
<p class="hx-plan-name"><?php esc_html_e( 'Enterprise', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-plan-desc","metadata":{"role":"content","name":"pricing.desc.3"}} -->
<p class="hx-plan-desc"><?php esc_html_e( 'For orgs with compliance and scale needs.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-plan-price"} -->
<div class="wp-block-group hx-plan-price">
<!-- wp:paragraph {"className":"hx-plan-amount","metadata":{"role":"content","name":"pricing.price.3"}} -->
<p class="hx-plan-amount"><?php esc_html_e( 'Custom', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-plan-period","metadata":{"role":"content","name":"pricing.period.3"}} -->
<p class="hx-plan-period"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"hx-btn hx-btn--ghost hx-plan-cta","metadata":{"role":"content","name":"pricing.cta_label.3"}} -->
<div class="wp-block-button hx-btn hx-btn--ghost hx-plan-cta"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( '/company/contact' ); ?>"><?php esc_html_e( 'Contact sales', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:list {"className":"hx-plan-features","metadata":{"role":"content","name":"pricing.features.3"}} -->
<ul class="wp-block-list hx-plan-features">
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Everything in Team', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( '1-year retention', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Dedicated ingest tier', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'SAML + SCIM', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Private cloud / BYOC', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( '99.99% SLA', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><svg class="hx-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span><?php esc_html_e( 'Named support engineer', 'wp-ja-kinetic' ); ?></span></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-plan-includes"} -->
<div class="wp-block-group hx-plan-includes">
<!-- wp:group {"className":"hx-pi-text"} -->
<div class="wp-block-group hx-pi-text">
<!-- wp:paragraph {"className":"hx-pi-title","metadata":{"role":"content","name":"pricing.inc_title"}} -->
<p class="hx-pi-title"><?php esc_html_e( 'Every plan includes', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-pi-desc","metadata":{"role":"content","name":"pricing.inc_desc"}} -->
<p class="hx-pi-desc"><?php esc_html_e( 'Unlimited users · OpenTelemetry ingest · 99.99% uptime SLA · data export · no seat fees.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"hx-pi-btn","metadata":{"role":"content","name":"pricing.inc_cta_label"}} -->
<div class="wp-block-button hx-pi-btn"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( '/company/contact' ); ?>"><?php esc_html_e( 'Talk to sales', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
