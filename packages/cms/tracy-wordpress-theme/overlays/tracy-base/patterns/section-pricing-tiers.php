<?php
/**
 * Title: Pricing tiers
 * Slug: tracy-base/section-pricing
 * Description: Eyebrow, heading, intro and three tiers on the warm surface — the Joomla ACM block `pricing`. One tier is recommended (`is-hot`, with its badge and the one accent button); the others get the outline button. Each feature line of the source's textarea is a list item.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: pricing, plans, tiers, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section tracy-section--band tracy-plans acm-pricing acm-pricing--warm bg-surface-warm border-y border-border-soft py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section tracy-section--band tracy-plans acm-pricing acm-pricing--warm bg-surface-warm border-y border-border-soft py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"pricing.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Sample website care plans', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"text-2xl mb-3","metadata":{"role":"content","name":"pricing.heading"}} -->
<h2 class="wp-block-heading text-2xl mb-3"><?php esc_html_e( 'Choose the level of support that fits.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead mb-0","metadata":{"role":"content","name":"pricing.intro"}} -->
<p class="tracy-lead mb-0"><?php esc_html_e( 'Illustrative plans for this demo studio. Scope and prices are examples, not an offer from Tracy.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-grid tracy-plans__grid acm-pricing__grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3"} -->
<div class="wp-block-group tracy-grid tracy-plans__grid acm-pricing__grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
<!-- wp:group {"className":"tracy-card tracy-plan p-6 flex flex-col","metadata":{"name":"pricing.item.1"}} -->
<div class="wp-block-group tracy-card tracy-plan p-6 flex flex-col">
<!-- wp:heading {"level":3,"className":"text-lg mb-1","metadata":{"role":"content","name":"pricing.tier-name.1"}} -->
<h3 class="wp-block-heading text-lg mb-1"><?php esc_html_e( 'Starter', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-4","metadata":{"role":"content","name":"pricing.tier-summary.1"}} -->
<p class="text-sm text-fg-2 mb-4"><?php esc_html_e( 'For a small website with occasional updates.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-plan__price font-display text-3xl leading-tight m-0","metadata":{"role":"content","name":"pricing.tier-price.1"}} -->
<p class="tracy-plan__price font-display text-3xl leading-tight m-0"><?php esc_html_e( '$0', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-meta","metadata":{"role":"content","name":"pricing.tier-period.1"}} -->
<p class="tracy-meta"><?php esc_html_e( 'demo plan', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"tracy-plan__list flex-1 my-4 mb-6","metadata":{"role":"content","name":"pricing.tier-features.1"}} -->
<ul class="wp-block-list tracy-plan__list flex-1 my-4 mb-6">
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Self-service editing', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Editable page sections', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Light and dark styles', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"pricing.tier-action.1"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Discuss Starter', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card tracy-plan is-hot p-6 flex flex-col border-accent shadow-[0_0_0_2px_var(--accent),var(--elev-raised)]","metadata":{"name":"pricing.item.2"}} -->
<div class="wp-block-group tracy-card tracy-plan is-hot p-6 flex flex-col border-accent shadow-[0_0_0_2px_var(--accent),var(--elev-raised)]">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"pricing.tier-badge.2"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Example package', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"text-lg mb-1","metadata":{"role":"content","name":"pricing.tier-name.2"}} -->
<h3 class="wp-block-heading text-lg mb-1"><?php esc_html_e( 'Studio', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-4","metadata":{"role":"content","name":"pricing.tier-summary.2"}} -->
<p class="text-sm text-fg-2 mb-4"><?php esc_html_e( 'For a team publishing and improving regularly.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-plan__price font-display text-3xl leading-tight m-0","metadata":{"role":"content","name":"pricing.tier-price.2"}} -->
<p class="tracy-plan__price font-display text-3xl leading-tight m-0"><?php esc_html_e( '$24', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-meta","metadata":{"role":"content","name":"pricing.tier-period.2"}} -->
<p class="tracy-meta"><?php esc_html_e( 'per month · demo', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"tracy-plan__list flex-1 my-4 mb-6","metadata":{"role":"content","name":"pricing.tier-features.2"}} -->
<ul class="wp-block-list tracy-plan__list flex-1 my-4 mb-6">
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Everything in Starter', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Content review support', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Scheduled site checks', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"pricing.tier-action.2"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Discuss Studio', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card tracy-plan p-6 flex flex-col","metadata":{"name":"pricing.item.3"}} -->
<div class="wp-block-group tracy-card tracy-plan p-6 flex flex-col">
<!-- wp:heading {"level":3,"className":"text-lg mb-1","metadata":{"role":"content","name":"pricing.tier-name.3"}} -->
<h3 class="wp-block-heading text-lg mb-1"><?php esc_html_e( 'Foundry', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-sm text-fg-2 mb-4","metadata":{"role":"content","name":"pricing.tier-summary.3"}} -->
<p class="text-sm text-fg-2 mb-4"><?php esc_html_e( 'For several sites and a shared design system.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-plan__price font-display text-3xl leading-tight m-0","metadata":{"role":"content","name":"pricing.tier-price.3"}} -->
<p class="tracy-plan__price font-display text-3xl leading-tight m-0"><?php esc_html_e( '$96', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"tracy-meta","metadata":{"role":"content","name":"pricing.tier-period.3"}} -->
<p class="tracy-meta"><?php esc_html_e( 'per month · demo', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"tracy-plan__list flex-1 my-4 mb-6","metadata":{"role":"content","name":"pricing.tier-features.3"}} -->
<ul class="wp-block-list tracy-plan__list flex-1 my-4 mb-6">
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Everything in Studio', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'Multi-site content planning', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"py-2 border-t border-border-soft"} -->
<li class="py-2 border-t border-border-soft"><?php esc_html_e( 'A shared review process', 'tracy-base' ); ?></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"pricing.tier-action.3"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Discuss Foundry', 'tracy-base' ); ?></a></div>
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
