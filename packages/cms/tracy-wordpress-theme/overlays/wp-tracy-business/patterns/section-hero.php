<?php
/**
 * Title: Hero
 * Slug: wp-tracy-business/section-hero
 * Description: Ink band: eyebrow, serif display heading, intro, two buttons (orange, outline) and an illustration on the right, then a four-figure band. Every spec section of type `hero`. The 404 page is the `wtb-hero--404` variant: the eyebrow becomes a giant orange "404", image and figures go.
 * Categories: wp-tracy-business, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: hero, masthead, figures, 404
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"tagName":"section","className":"wtb-section wtb-hero"} -->
<section class="wp-block-group wtb-section wtb-hero">
<!-- wp:group {"className":"wtb-inner wtb-hero__inner"} -->
<div class="wp-block-group wtb-inner wtb-hero__inner">
<!-- wp:group {"className":"wtb-hero__copy"} -->
<div class="wp-block-group wtb-hero__copy">
<!-- wp:paragraph {"className":"wtb-eyebrow","metadata":{"role":"content","name":"hero.eyebrow"}} -->
<p class="wtb-eyebrow"><?php esc_html_e( 'Established 2004', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"wtb-hero__heading","metadata":{"role":"content","name":"hero.heading"}} -->
<h1 class="wp-block-heading wtb-hero__heading"><?php esc_html_e( 'Building the groundwork for next-generation plants', 'wp-tracy-business' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"wtb-intro","metadata":{"role":"content","name":"hero.intro"}} -->
<p class="wtb-intro"><?php esc_html_e( 'Design–build main contractor for industrial park infrastructure, factory buildings and engineering systems across 14 regions of Central and Volga Russia.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"wtb-actions"} -->
<div class="wp-block-buttons wtb-actions">
<!-- wp:button {"className":"is-style-orange","metadata":{"role":"content","name":"hero.cta.1"}} -->
<div class="wp-block-button is-style-orange"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'See our capabilities', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline","metadata":{"role":"content","name":"hero.cta.2"}} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Download company profile (PDF)', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:image {"className":"wtb-hero__media","sizeSlug":"large","metadata":{"role":"content","name":"hero.img"}} -->
<figure class="wp-block-image size-large wtb-hero__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Industrial park illustration', 'wp-tracy-business' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-inner wtb-hero__stats"} -->
<div class="wp-block-group wtb-inner wtb-hero__stats">
<!-- wp:group {"className":"wtb-stat","metadata":{"name":"hero.item.1"}} -->
<div class="wp-block-group wtb-stat">
<!-- wp:paragraph {"className":"wtb-stat__n","metadata":{"role":"content","name":"hero.item.1.title"}} -->
<p class="wtb-stat__n"><?php esc_html_e( '380+', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__label","metadata":{"role":"content","name":"hero.item.1.text"}} -->
<p class="wtb-stat__label"><?php esc_html_e( 'Projects delivered', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__meta","metadata":{"role":"content","name":"hero.item.1.meta"}} -->
<p class="wtb-stat__meta"><?php esc_html_e( 'Group-wide', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-stat","metadata":{"name":"hero.item.2"}} -->
<div class="wp-block-group wtb-stat">
<!-- wp:paragraph {"className":"wtb-stat__n","metadata":{"role":"content","name":"hero.item.2.title"}} -->
<p class="wtb-stat__n"><?php esc_html_e( '1.2M m²', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__label","metadata":{"role":"content","name":"hero.item.2.text"}} -->
<p class="wtb-stat__label"><?php esc_html_e( 'Built area', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__meta","metadata":{"role":"content","name":"hero.item.2.meta"}} -->
<p class="wtb-stat__meta"><?php esc_html_e( 'Group-wide', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-stat","metadata":{"name":"hero.item.3"}} -->
<div class="wp-block-group wtb-stat">
<!-- wp:paragraph {"className":"wtb-stat__n","metadata":{"role":"content","name":"hero.item.3.title"}} -->
<p class="wtb-stat__n"><?php esc_html_e( '22 years', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__label","metadata":{"role":"content","name":"hero.item.3.text"}} -->
<p class="wtb-stat__label"><?php esc_html_e( 'Industry experience', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__meta","metadata":{"role":"content","name":"hero.item.3.meta"}} -->
<p class="wtb-stat__meta"><?php esc_html_e( 'Group-wide', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wtb-stat","metadata":{"name":"hero.item.4"}} -->
<div class="wp-block-group wtb-stat">
<!-- wp:paragraph {"className":"wtb-stat__n","metadata":{"role":"content","name":"hero.item.4.title"}} -->
<p class="wtb-stat__n"><?php esc_html_e( '0', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__label","metadata":{"role":"content","name":"hero.item.4.text"}} -->
<p class="wtb-stat__label"><?php esc_html_e( 'Serious incidents in 2025', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"wtb-stat__meta","metadata":{"role":"content","name":"hero.item.4.meta"}} -->
<p class="wtb-stat__meta"><?php esc_html_e( 'Group-wide', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
