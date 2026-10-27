<?php
/**
 * Title: Carousel
 * Slug: tracy-base/section-carousel
 * Description: Eyebrow, heading, intro and a row of five slides that scroll sideways with scroll-snap, three in view — the Joomla ACM block `carousel` (`per-view=3`, `ground=gray`). The source's mechanism is the same native scroll container; only its two step buttons need a script and are not carried. Slide image and link are not carried: empty on the source instance.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: carousel, slider, slides, scroll, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section tracy-section--band acm-carousel acm-carousel--gray acm-carousel--per-3 bg-surface border-y border-border-soft py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section tracy-section--band acm-carousel acm-carousel--gray acm-carousel--per-3 bg-surface border-y border-border-soft py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"carousel.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'What you get', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"text-2xl mb-3","metadata":{"role":"content","name":"carousel.heading"}} -->
<h2 class="wp-block-heading text-2xl mb-3"><?php esc_html_e( 'The essentials, working together.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead mb-0","metadata":{"role":"content","name":"carousel.intro"}} -->
<p class="tracy-lead mb-0"><?php esc_html_e( 'A practical foundation for presenting the business and keeping content up to date.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-carousel__track flex gap-6"} -->
<div class="wp-block-group acm-carousel__track flex gap-6">
<!-- wp:group {"className":"acm-carousel__slide tracy-card p-6 flex flex-col","metadata":{"name":"carousel.item.1"}} -->
<div class="wp-block-group acm-carousel__slide tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"carousel.slide-kicker.1"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Foundations', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"carousel.slide-title.1"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'A recognisable identity', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"carousel.slide-text.1"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'A shared approach to colour, type and imagery connects the whole site.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-carousel__slide tracy-card p-6 flex flex-col","metadata":{"name":"carousel.item.2"}} -->
<div class="wp-block-group acm-carousel__slide tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"carousel.slide-kicker.2"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Layout', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"carousel.slide-title.2"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Pages with a purpose', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"carousel.slide-text.2"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Choose the layout that helps a visitor understand the topic and next step.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-carousel__slide tracy-card p-6 flex flex-col","metadata":{"name":"carousel.item.3"}} -->
<div class="wp-block-group acm-carousel__slide tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"carousel.slide-kicker.3"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Content', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"carousel.slide-title.3"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Content your team owns', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"carousel.slide-text.3"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Edit text and images in the admin without rebuilding the page.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-carousel__slide tracy-card p-6 flex flex-col","metadata":{"name":"carousel.item.4"}} -->
<div class="wp-block-group acm-carousel__slide tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"carousel.slide-kicker.4"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Dark', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"carousel.slide-title.4"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Comfort in light and dark', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"carousel.slide-text.4"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'The same content stays readable in both appearance modes.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-carousel__slide tracy-card p-6 flex flex-col","metadata":{"name":"carousel.item.5"}} -->
<div class="wp-block-group acm-carousel__slide tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"carousel.slide-kicker.5"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Speed', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"text-lg mb-2","metadata":{"role":"content","name":"carousel.slide-title.5"}} -->
<h3 class="wp-block-heading text-lg mb-2"><?php esc_html_e( 'Room to keep improving', 'tracy-base' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"text-fg-2 mb-0","metadata":{"role":"content","name":"carousel.slide-text.5"}} -->
<p class="text-fg-2 mb-0"><?php esc_html_e( 'Reuse sections as services and customer needs change.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
