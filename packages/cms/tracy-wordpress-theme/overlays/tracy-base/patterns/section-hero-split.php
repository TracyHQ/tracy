<?php
/**
 * Title: Hero — split
 * Slug: tracy-base/section-hero-split
 * Description: Hero with copy on the left and an image on the right — the Joomla ACM block `hero` in `style-1`. Copy and buttons are content; the aside/badge branch of the source is not carried (an image always wins over it on the source site).
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: hero, masthead, acm, split
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-hero tracy-hero-split acm-hero acm-hero--split py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-hero tracy-hero-split acm-hero acm-hero--split py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-hero__inner max-w-page mx-auto grid gap-8 items-center"} -->
<div class="wp-block-group tracy-hero__inner max-w-page mx-auto grid gap-8 items-center">
<!-- wp:group {"className":"tracy-hero__copy"} -->
<div class="wp-block-group tracy-hero__copy">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"hero.eyebrow"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'Thoughtful websites. Practical results.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"tracy-display","metadata":{"role":"content","name":"hero.title"}} -->
<h1 class="wp-block-heading tracy-display"><?php esc_html_e( 'A better website starts with your business.', 'tracy-base' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead","metadata":{"role":"content","name":"hero.lead"}} -->
<p class="tracy-lead"><?php esc_html_e( 'Strategy, design and development for teams who want a clearer story and a website they can keep moving.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"hero.btn-1"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Explore our services', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"hero.btn-2"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Meet the studio', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:image {"className":"tracy-hero__media","sizeSlug":"large","metadata":{"role":"content","name":"hero.hero-image"}} -->
<figure class="wp-block-image size-large tracy-hero__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Illustrative design studio workspace with website concepts on desktop and laptop screens', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
