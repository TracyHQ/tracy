<?php
/**
 * Title: Slideshow
 * Slug: wp-ja-morgan/acm-slideshow
 * Description: Full-width picture slides, each with a two-line headline, a lead and a button, stepped from a row of titled tabs below (Joomla ACM `slideshow` style-owl of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: slideshow, slider, hero, carousel, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm acm-slideshow tracy-motion-carousel tracy-motion-carousel--dots","metadata":{"name":"slideshow.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm acm-slideshow tracy-motion-carousel tracy-motion-carousel--dots">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"slideshow.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"slider-content","metadata":{"name":"slideshow.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group slider-content">
<!-- wp:image {"sizeSlug":"full","className":"slider-bg","metadata":{"role":"content","name":"slideshow.image.1"}} -->
<figure class="wp-block-image size-full slider-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"slider-content-inner","layout":{"type":"default"}} -->
<div class="wp-block-group slider-content-inner">
<!-- wp:heading {"level":2,"className":"title","metadata":{"role":"content","name":"slideshow.title.1"}} -->
<h2 class="wp-block-heading title"><?php esc_html_e( 'A headline', 'wp-ja-morgan' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"description lead","metadata":{"role":"content","name":"slideshow.desc.1"}} -->
<p class="description lead"><?php esc_html_e( 'A lead of two or three lines.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"btn btn-primary jm-arrow","metadata":{"role":"content","name":"slideshow.button.1"}} -->
<div class="wp-block-button btn btn-primary jm-arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Find Out More', 'wp-ja-morgan' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jm-slide-tabs","layout":{"type":"default"}} -->
<div class="wp-block-group jm-slide-tabs">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:paragraph {"className":"jm-slide-tab","metadata":{"role":"content","name":"slideshow.title-dot.1"}} -->
<p class="jm-slide-tab"><?php esc_html_e( 'A slide', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
