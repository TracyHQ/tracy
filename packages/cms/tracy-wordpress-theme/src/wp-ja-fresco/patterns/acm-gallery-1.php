<?php
/**
 * Title: Picture strip
 * Slug: wp-ja-fresco/acm-gallery-1
 * Description: A full-width strip of square pictures, four across on a wide screen, that moves one picture at a time; a picture shows its caption over a dark veil on hover (Joomla ACM `gallery` style-1 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: gallery, pictures, strip, carousel, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-gallery style-1","metadata":{"name":"gallery.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-gallery style-1">
<!-- wp:group {"className":"gallery-strip tracy-motion-carousel jf-autoplay jf-per-4","metadata":{"name":"gallery.carousel"},"layout":{"type":"default"}} -->
<div class="wp-block-group gallery-strip tracy-motion-carousel jf-autoplay jf-per-4">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"gallery.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"item-inner","metadata":{"name":"gallery.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group item-inner">
<!-- wp:image {"sizeSlug":"full","className":"gallery-img","metadata":{"role":"content","name":"gallery.gallery-image.1"}} -->
<figure class="wp-block-image size-full gallery-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"gallery-caption","metadata":{"role":"content","name":"gallery.gallery-alt.1"}} -->
<p class="gallery-caption"><?php esc_html_e( 'What the picture shows', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
