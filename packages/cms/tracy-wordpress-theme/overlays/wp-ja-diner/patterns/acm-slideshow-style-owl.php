<?php
/**
 * Title: Slideshow: owl
 * Slug: wp-ja-diner/acm-slideshow-style-owl
 * Description: Full-width slides with a dark photo, a title, a lead and two buttons (Joomla ACM slideshow style-owl of JA Diner).
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: slideshow, owl, acm
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:group {"className":"wrap t3-slideshow","metadata":{"name":"slideshow.root"}} -->
<div class="wp-block-group wrap t3-slideshow">
<!-- wp:group {"className":"acm-slideshow acm-owl"} -->
<div class="wp-block-group acm-slideshow acm-owl">
<!-- wp:group {"className":"owl-carousel owl-theme tracy-motion-carousel tracy-motion-carousel--dots"} -->
<div class="wp-block-group owl-carousel owl-theme tracy-motion-carousel tracy-motion-carousel--dots">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"slideshow.list"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"item","metadata":{"name":"slideshow.item.1"}} -->
<div class="wp-block-group item">
<!-- wp:image {"sizeSlug":"full","className":"img-bg","metadata":{"role":"content","name":"slideshow.image.1"}} -->
<figure class="wp-block-image size-full img-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"mask"} -->
<div class="wp-block-group mask">

</div>
<!-- /wp:group -->
<!-- wp:group {"className":"slider-content container"} -->
<div class="wp-block-group slider-content container">
<!-- wp:group {"className":"slider-content-inner"} -->
<div class="wp-block-group slider-content-inner">
<!-- wp:heading {"level":1,"className":"slide-title","metadata":{"role":"content","name":"slideshow.title.1"}} -->
<h1 class="wp-block-heading slide-title"><?php esc_html_e( 'Hey Harry, are you ready for restaurant week?', 'wp-ja-diner' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead","metadata":{"role":"content","name":"slideshow.desc.1"}} -->
<p class="lead"><?php esc_html_e( 'A short line under the title.', 'wp-ja-diner' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"slide-action"} -->
<div class="wp-block-group slide-action">
<!-- wp:paragraph {"className":"slide-btn","metadata":{"role":"content","name":"slideshow.button1.1"}} -->
<p class="slide-btn"><a class="btn btn-primary" href="#"><?php esc_html_e( 'Book a Table', 'wp-ja-diner' ); ?></a></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"slide-btn","metadata":{"role":"content","name":"slideshow.button2.1"}} -->
<p class="slide-btn"><a class="btn btn-inverse" href="#"><?php esc_html_e( 'View full menu', 'wp-ja-diner' ); ?></a></p>
<!-- /wp:paragraph -->
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
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
