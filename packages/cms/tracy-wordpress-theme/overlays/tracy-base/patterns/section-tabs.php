<?php
/**
 * Title: Tabs
 * Slug: tracy-base/section-tabs
 * Description: Eyebrow, heading, a row of three tab labels and the three panels — the Joomla ACM block `tabs` (`ground=canvas`). WordPress core has no tabs block, and the source is progressive-enhanced: without its script every panel shows, one under the other. That is what this pattern renders; the labels are in-page links to their panels. Wiring the source's tab script back turns it into real tabs. Panel images are not carried: empty on the source instance.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: tabs, panels, process, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-tabs acm-tabs--canvas py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-tabs acm-tabs--canvas py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"tabs.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'How it works', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"text-2xl mb-0","metadata":{"role":"content","name":"tabs.heading"}} -->
<h2 class="wp-block-heading text-2xl mb-0"><?php esc_html_e( 'A process you can follow.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:list {"className":"acm-tabs__list flex flex-wrap gap-8 border-b border-border-soft mb-8"} -->
<ul class="wp-block-list acm-tabs__list flex flex-wrap gap-8 border-b border-border-soft mb-8">
<!-- wp:list-item {"className":"acm-tabs__tab","metadata":{"role":"content","name":"tabs.tab-label.1"}} -->
<li class="acm-tabs__tab"><a href="#acm-tab-1"><?php esc_html_e( 'Discover', 'tracy-base' ); ?></a></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"acm-tabs__tab","metadata":{"role":"content","name":"tabs.tab-label.2"}} -->
<li class="acm-tabs__tab"><a href="#acm-tab-2"><?php esc_html_e( 'Create', 'tracy-base' ); ?></a></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"acm-tabs__tab","metadata":{"role":"content","name":"tabs.tab-label.3"}} -->
<li class="acm-tabs__tab"><a href="#acm-tab-3"><?php esc_html_e( 'Improve', 'tracy-base' ); ?></a></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
<!-- wp:group {"anchor":"acm-tab-1","className":"acm-tabs__panel max-w-[62ch] mb-8","metadata":{"name":"tabs.item.1"}} -->
<div class="wp-block-group acm-tabs__panel max-w-[62ch] mb-8" id="acm-tab-1">
<!-- wp:heading {"level":3,"className":"text-xl mb-3","metadata":{"role":"content","name":"tabs.tab-title.1"}} -->
<h3 class="wp-block-heading text-xl mb-3"><?php esc_html_e( 'Understand the business first', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"tabs.tab-body.1"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'We map the audience, offer and important customer questions before deciding what each page needs.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"anchor":"acm-tab-2","className":"acm-tabs__panel max-w-[62ch] mb-8","metadata":{"name":"tabs.item.2"}} -->
<div class="wp-block-group acm-tabs__panel max-w-[62ch] mb-8" id="acm-tab-2">
<!-- wp:heading {"level":3,"className":"text-xl mb-3","metadata":{"role":"content","name":"tabs.tab-title.2"}} -->
<h3 class="wp-block-heading text-xl mb-3"><?php esc_html_e( 'Review something concrete', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"tabs.tab-body.2"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Page concepts bring the message and design together. Reviews focus on clarity, hierarchy and the next action.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"anchor":"acm-tab-3","className":"acm-tabs__panel max-w-[62ch]","metadata":{"name":"tabs.item.3"}} -->
<div class="wp-block-group acm-tabs__panel max-w-[62ch]" id="acm-tab-3">
<!-- wp:heading {"level":3,"className":"text-xl mb-3","metadata":{"role":"content","name":"tabs.tab-title.3"}} -->
<h3 class="wp-block-heading text-xl mb-3"><?php esc_html_e( 'Keep the site useful', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"tabs.tab-body.3"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Editable content and a clear handover support the next update. Regular reviews help the site keep pace with the business.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
