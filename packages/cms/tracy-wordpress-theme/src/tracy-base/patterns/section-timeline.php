<?php
/**
 * Title: Timeline
 * Slug: tracy-base/section-timeline
 * Description: Eyebrow, heading, intro and four dated entries down a vertical rule — the Joomla ACM block `timeline` (`ground=canvas`, `heading-level=h1` on the source page). Each entry is a marker, a title and a line of text; the rule and the dots are CSS, as in the source. No script.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: timeline, history, milestones, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-timeline acm-timeline--canvas py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-timeline acm-timeline--canvas py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"timeline.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'A fictional studio timeline', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"text-2xl mb-3","metadata":{"role":"content","name":"timeline.heading"}} -->
<h1 class="wp-block-heading text-2xl mb-3"><?php esc_html_e( 'Small steps, a shared direction.', 'tracy-base' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead mb-0","metadata":{"role":"content","name":"timeline.intro"}} -->
<p class="tracy-lead mb-0"><?php esc_html_e( 'An example company story for you to replace with your own milestones.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-timeline__list"} -->
<div class="wp-block-group acm-timeline__list">
<!-- wp:group {"className":"acm-timeline__entry","metadata":{"name":"timeline.item.1"}} -->
<div class="wp-block-group acm-timeline__entry">
<!-- wp:paragraph {"className":"acm-timeline__marker tracy-eyebrow","metadata":{"role":"content","name":"timeline.entry-marker.1"}} -->
<p class="acm-timeline__marker tracy-eyebrow"><?php esc_html_e( '2019', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-timeline__body"} -->
<div class="wp-block-group acm-timeline__body">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"timeline.entry-title.1"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'A studio takes shape', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"timeline.entry-text.1"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Our fictional team begins by bringing design and development together.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-timeline__entry","metadata":{"name":"timeline.item.2"}} -->
<div class="wp-block-group acm-timeline__entry">
<!-- wp:paragraph {"className":"acm-timeline__marker tracy-eyebrow","metadata":{"role":"content","name":"timeline.entry-marker.2"}} -->
<p class="acm-timeline__marker tracy-eyebrow"><?php esc_html_e( '2021', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-timeline__body"} -->
<div class="wp-block-group acm-timeline__body">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"timeline.entry-title.2"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'A clearer working process', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"timeline.entry-text.2"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'The sample studio introduces shared project briefs and review checkpoints.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-timeline__entry","metadata":{"name":"timeline.item.3"}} -->
<div class="wp-block-group acm-timeline__entry">
<!-- wp:paragraph {"className":"acm-timeline__marker tracy-eyebrow","metadata":{"role":"content","name":"timeline.entry-marker.3"}} -->
<p class="acm-timeline__marker tracy-eyebrow"><?php esc_html_e( '2023', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-timeline__body"} -->
<div class="wp-block-group acm-timeline__body">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"timeline.entry-title.3"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Content joins the conversation', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"timeline.entry-text.3"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Research and editorial planning become part of every project conversation.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-timeline__entry","metadata":{"name":"timeline.item.4"}} -->
<div class="wp-block-group acm-timeline__entry">
<!-- wp:paragraph {"className":"acm-timeline__marker tracy-eyebrow","metadata":{"role":"content","name":"timeline.entry-marker.4"}} -->
<p class="acm-timeline__marker tracy-eyebrow"><?php esc_html_e( '2026', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"acm-timeline__body"} -->
<div class="wp-block-group acm-timeline__body">
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"timeline.entry-title.4"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'A foundation for the next chapter', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"timeline.entry-text.4"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Reusable page sections help the team support a wider range of sites.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
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
