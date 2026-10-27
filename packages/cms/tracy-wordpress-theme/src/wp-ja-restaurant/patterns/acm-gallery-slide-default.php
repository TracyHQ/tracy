<?php
/**
 * Title: Gallery slide
 * Slug: wp-ja-restaurant/acm-gallery-slide-default
 * Description: A full-width row of album pictures, each with a red photo-count tag, stepped by swipe or arrow keys (Joomla ACM gallery-slide of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: gallery, albums, pictures, carousel, acm
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"gallery-slide.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"gallery-slide no-padding","layout":{"type":"default"}} -->
<div class="wp-block-group gallery-slide no-padding">
<!-- wp:group {"className":"owl-carousel owl-theme tracy-motion-carousel","layout":{"type":"default"}} -->
<div class="wp-block-group owl-carousel owl-theme tracy-motion-carousel">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"gallery-slide.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"item","metadata":{"name":"gallery-slide.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group item">
<!-- wp:group {"className":"item-image ja-gallery-list","layout":{"type":"default"}} -->
<div class="wp-block-group item-image ja-gallery-list">
<!-- wp:group {"className":"btn-play","layout":{"type":"default"}} -->
<div class="wp-block-group btn-play">
<!-- wp:html -->
<i class="ion-android-camera" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"num-photos","metadata":{"role":"content","name":"gallery-slide.count.1"}} -->
<p class="num-photos"><?php esc_html_e( '5 Photos', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:image {"className":"jr-f-image","sizeSlug":"full","metadata":{"role":"content","name":"gallery-slide.image.1"}} -->
<figure class="wp-block-image size-full jr-f-image"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:html -->
<a class="btn btn-default btn-block btn-lg" href="<?php echo esc_url( home_url( '/gallery/' ) ); ?>"><?php esc_html_e( 'View more our gallery', 'wp-ja-restaurant' ); ?></a>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
