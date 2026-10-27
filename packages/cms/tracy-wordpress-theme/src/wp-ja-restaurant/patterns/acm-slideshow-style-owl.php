<?php
/**
 * Title: Slideshow
 * Slug: wp-ja-restaurant/acm-slideshow-style-owl
 * Description: Full-width picture slides with a large uppercase headline, stepped by two arrows and a row of numbered buttons (Joomla ACM slideshow style-owl of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: slideshow, slider, carousel, pictures, acm
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"acm-slideshow acm-product","metadata":{"name":"slideshow.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group acm-slideshow acm-product">
<!-- wp:group {"className":"owl-carousel owl-theme tracy-motion-carousel tracy-motion-carousel--nav tracy-motion-carousel--dots","layout":{"type":"default"}} -->
<div class="wp-block-group owl-carousel owl-theme tracy-motion-carousel tracy-motion-carousel--nav tracy-motion-carousel--dots">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"slideshow.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"item","metadata":{"name":"slideshow.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group item">
<!-- wp:image {"sizeSlug":"full","className":"img-bg","metadata":{"role":"content","name":"slideshow.image.1"}} -->
<figure class="wp-block-image size-full img-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"slide-content container","layout":{"type":"default"}} -->
<div class="wp-block-group slide-content container">
<!-- wp:paragraph {"className":"slide-title","metadata":{"role":"content","name":"slideshow.slide-title.1"}} -->
<p class="slide-title"><?php esc_html_e( 'The best food in town', 'wp-ja-restaurant' ); ?></p>
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
