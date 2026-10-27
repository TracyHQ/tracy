<?php
/**
 * Title: Features intro
 * Slug: tracy-base/section-features-intro
 * Description: Eyebrow, title, lead and four cards, the first a spotlight on the warm surface and the wide track (no label: the approved Joomla page shows none) — the Joomla ACM block `features-intro`. Each card links out with its own label. The icon branch is not carried: `card-icon` is empty on both source instances.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: features, services, cards, spotlight, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-features-intro py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-features-intro py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"features-intro.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'How we help', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"text-2xl mb-3","metadata":{"role":"content","name":"features-intro.title"}} -->
<h2 class="wp-block-heading text-2xl mb-3"><?php esc_html_e( 'From the first question to the finished website.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead mb-0","metadata":{"role":"content","name":"features-intro.lead"}} -->
<p class="tracy-lead mb-0"><?php esc_html_e( 'A connected service for planning the message, shaping the design and keeping the site useful.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-grid tracy-cards acm-features-intro__grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3"} -->
<div class="wp-block-group tracy-grid tracy-cards acm-features-intro__grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
<!-- wp:group {"className":"tracy-card acm-features-intro__card acm-features-intro__card--feature bg-surface-warm p-8 flex flex-col","metadata":{"name":"features-intro.item.1"}} -->
<div class="wp-block-group tracy-card acm-features-intro__card acm-features-intro__card--feature bg-surface-warm p-8 flex flex-col">
<!-- wp:heading {"level":3,"className":"text-xl mb-2","metadata":{"role":"content","name":"features-intro.card-title.1"}} -->
<h3 class="wp-block-heading text-xl mb-2"><?php esc_html_e( 'Plan with purpose', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 flex-1","metadata":{"role":"content","name":"features-intro.card-text.1"}} -->
<p class="text-fg-2 flex-1"><?php esc_html_e( 'Start with your audience and the decisions they need to make. We turn those questions into a focused page plan.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-features-intro__card-action mb-0","metadata":{"role":"content","name":"features-intro.card-link.1"}} -->
<p class="acm-features-intro__card-action mb-0"><a href="#"><?php esc_html_e( 'Website strategy', 'tracy-base' ); ?> →</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card acm-features-intro__card p-6 flex flex-col","metadata":{"name":"features-intro.item.2"}} -->
<div class="wp-block-group tracy-card acm-features-intro__card p-6 flex flex-col">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"features-intro.card-title.2"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Design with clarity', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 flex-1","metadata":{"role":"content","name":"features-intro.card-text.2"}} -->
<p class="text-fg-2 flex-1"><?php esc_html_e( 'Bring typography, colour and imagery together so each page feels like the same business.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-features-intro__card-action mb-0","metadata":{"role":"content","name":"features-intro.card-link.2"}} -->
<p class="acm-features-intro__card-action mb-0"><a href="#"><?php esc_html_e( 'Brand and design', 'tracy-base' ); ?> →</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card acm-features-intro__card p-6 flex flex-col","metadata":{"name":"features-intro.item.3"}} -->
<div class="wp-block-group tracy-card acm-features-intro__card p-6 flex flex-col">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"features-intro.card-title.3"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Build for everyday use', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 flex-1","metadata":{"role":"content","name":"features-intro.card-text.3"}} -->
<p class="text-fg-2 flex-1"><?php esc_html_e( 'Give your team editable sections and a clear handover, with the main journeys tested on desktop and mobile.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-features-intro__card-action mb-0","metadata":{"role":"content","name":"features-intro.card-link.3"}} -->
<p class="acm-features-intro__card-action mb-0"><a href="#"><?php esc_html_e( 'Website development', 'tracy-base' ); ?> →</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card acm-features-intro__card p-6 flex flex-col","metadata":{"name":"features-intro.item.4"}} -->
<div class="wp-block-group tracy-card acm-features-intro__card p-6 flex flex-col">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"features-intro.card-title.4"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Keep improving', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 flex-1","metadata":{"role":"content","name":"features-intro.card-text.4"}} -->
<p class="text-fg-2 flex-1"><?php esc_html_e( 'Review what customers need next, update the content and make the next useful change.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-features-intro__card-action mb-0","metadata":{"role":"content","name":"features-intro.card-link.4"}} -->
<p class="acm-features-intro__card-action mb-0"><a href="#"><?php esc_html_e( 'Website care', 'tracy-base' ); ?> →</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
