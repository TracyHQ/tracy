<?php
/**
 * Title: Hero with picture carousel
 * Slug: wp-ja-vega/section-hero
 * Description: The JA Vega home hero (Joomla ACM `hero` style-1): a background picture, the headline across the top, a lead, two buttons and a sign-up badge on the left, and a picture carousel with dots on the right. Every picture row of the ACM is one slide.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: hero, header, carousel, slider, banner, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-hero","metadata":{"name":"hero.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-hero">
<!-- wp:image {"sizeSlug":"full","className":"jv-bg","metadata":{"role":"content","name":"hero.hero-bg.1"}} -->
<figure class="wp-block-image size-full jv-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:heading {"level":1,"className":"jv-hero__title tracy-motion-reveal","metadata":{"role":"content","name":"hero.title.1"}} -->
<h1 class="wp-block-heading jv-hero__title tracy-motion-reveal"><?php esc_html_e( 'Transforming IT solutions for a digital world', 'wp-ja-vega' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:group {"className":"jv-hero__row","layout":{"type":"default"}} -->
<div class="wp-block-group jv-hero__row">
<!-- wp:group {"className":"jv-hero__copy","layout":{"type":"default"}} -->
<div class="wp-block-group jv-hero__copy">
<!-- wp:paragraph {"className":"jv-lead tracy-motion-reveal","metadata":{"role":"content","name":"hero.desc.1"}} -->
<p class="jv-lead tracy-motion-reveal"><?php esc_html_e( 'A lead of two or three lines that says what the company does.', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jv-actions"} -->
<div class="wp-block-buttons jv-actions">
<!-- wp:button {"className":"jv-btn jv-btn--primary jv-btn--arrow tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"hero.button.1"}} -->
<div class="wp-block-button jv-btn jv-btn--primary jv-btn--arrow tracy-motion-reveal tracy-motion-delay-1"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Contact us', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"jv-btn jv-btn--light jv-btn--arrow tracy-motion-reveal tracy-motion-delay-2","metadata":{"role":"content","name":"hero.button-2.1"}} -->
<div class="wp-block-button jv-btn jv-btn--light jv-btn--arrow tracy-motion-reveal tracy-motion-delay-2"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Services', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:group {"className":"jv-hero__more tracy-motion-reveal tracy-motion-delay-3","layout":{"type":"default"}} -->
<div class="wp-block-group jv-hero__more tracy-motion-reveal tracy-motion-delay-3">
<!-- wp:image {"sizeSlug":"full","className":"jv-hero__avatars","metadata":{"role":"content","name":"hero.avatar.1"}} -->
<figure class="wp-block-image size-full jv-hero__avatars"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jv-hero__badge","layout":{"type":"default"}} -->
<div class="wp-block-group jv-hero__badge">
<!-- wp:paragraph {"metadata":{"role":"content","name":"hero.avatar-title.1"}} -->
<p><span class="jv-accent"><?php esc_html_e( '20K+', 'wp-ja-vega' ); ?></span> <?php esc_html_e( 'users have signed up', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-hero__media tracy-motion-reveal tracy-motion-reveal--fade-left tracy-motion-delay-4","layout":{"type":"default"}} -->
<div class="wp-block-group jv-hero__media tracy-motion-reveal tracy-motion-reveal--fade-left tracy-motion-delay-4">
<!-- wp:group {"className":"tracy-motion-carousel tracy-motion-carousel--dots jv-carousel","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-carousel tracy-motion-carousel--dots jv-carousel">
<!-- wp:group {"className":"tracy-motion-track","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"tracy-motion-slide","metadata":{"name":"hero.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-slide">
<!-- wp:image {"sizeSlug":"full","className":"jv-hero__picture","metadata":{"role":"content","name":"hero.image-decor.1"}} -->
<figure class="wp-block-image size-full jv-hero__picture"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
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
