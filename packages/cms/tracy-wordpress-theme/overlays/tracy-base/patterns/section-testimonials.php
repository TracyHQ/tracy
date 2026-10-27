<?php
/**
 * Title: Testimonials
 * Slug: tracy-base/section-testimonials
 * Description: Eyebrow, heading and three quotes, each with a name and a role — the Joomla ACM block `testimonials` (`columns=3`). The avatar branch is not carried: it is empty on every source instance, which always falls back to initials.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: testimonials, quotes, proof, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section tracy-testimonials acm-testimonials acm-testimonials--cols-3 py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section tracy-testimonials acm-testimonials acm-testimonials--cols-3 py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-section__inner max-w-page mx-auto"} -->
<div class="wp-block-group tracy-section__inner max-w-page mx-auto">
<!-- wp:group {"className":"tracy-section__head max-w-[62ch] mb-8"} -->
<div class="wp-block-group tracy-section__head max-w-[62ch] mb-8">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"testimonials.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Illustrative client stories', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"text-2xl mb-0","metadata":{"role":"content","name":"testimonials.heading"}} -->
<h2 class="wp-block-heading text-2xl mb-0"><?php esc_html_e( 'What a good working relationship can feel like.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-grid tracy-cards acm-testimonials__grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3"} -->
<div class="wp-block-group tracy-grid tracy-cards acm-testimonials__grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
<!-- wp:group {"className":"tracy-card p-6 flex flex-col","metadata":{"name":"testimonials.item.1"}} -->
<div class="wp-block-group tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"acm-testimonials__quote text-lg text-fg flex-1","metadata":{"role":"content","name":"testimonials.quote.1"}} -->
<p class="acm-testimonials__quote text-lg text-fg flex-1"><?php esc_html_e( 'The project began with questions about our customers. By the time we reviewed the design, everyone understood what each page needed to do.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-testimonials__name font-bold mb-0","metadata":{"role":"content","name":"testimonials.quote-name.1"}} -->
<p class="acm-testimonials__name font-bold mb-0"><?php esc_html_e( 'Alex Morgan', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-testimonials__role tracy-meta mb-0","metadata":{"role":"content","name":"testimonials.quote-role.1"}} -->
<p class="acm-testimonials__role tracy-meta mb-0"><?php esc_html_e( 'Marketing lead · fictional retail brand', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card p-6 flex flex-col","metadata":{"name":"testimonials.item.2"}} -->
<div class="wp-block-group tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"acm-testimonials__quote text-lg text-fg flex-1","metadata":{"role":"content","name":"testimonials.quote.2"}} -->
<p class="acm-testimonials__quote text-lg text-fg flex-1"><?php esc_html_e( 'The handover made the difference. Our team knew where to change the content and could keep the site current.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-testimonials__name font-bold mb-0","metadata":{"role":"content","name":"testimonials.quote-name.2"}} -->
<p class="acm-testimonials__name font-bold mb-0"><?php esc_html_e( 'Jordan Lee', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-testimonials__role tracy-meta mb-0","metadata":{"role":"content","name":"testimonials.quote-role.2"}} -->
<p class="acm-testimonials__role tracy-meta mb-0"><?php esc_html_e( 'Operations lead · fictional consultancy', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-card p-6 flex flex-col","metadata":{"name":"testimonials.item.3"}} -->
<div class="wp-block-group tracy-card p-6 flex flex-col">
<!-- wp:paragraph {"className":"acm-testimonials__quote text-lg text-fg flex-1","metadata":{"role":"content","name":"testimonials.quote.3"}} -->
<p class="acm-testimonials__quote text-lg text-fg flex-1"><?php esc_html_e( 'Having the message, design and build discussed together made the review process much easier to follow.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-testimonials__name font-bold mb-0","metadata":{"role":"content","name":"testimonials.quote-name.3"}} -->
<p class="acm-testimonials__name font-bold mb-0"><?php esc_html_e( 'Sam Rivera', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-testimonials__role tracy-meta mb-0","metadata":{"role":"content","name":"testimonials.quote-role.3"}} -->
<p class="acm-testimonials__role tracy-meta mb-0"><?php esc_html_e( 'Founder · fictional creative business', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
