<?php
/**
 * Title: Mosaic of large and small pictures
 * Slug: wp-ja-fresco/acm-gallery-3
 * Description: A full-width mosaic of pictures, some twice the size of the others, two columns on small screens and four on large ones (Joomla ACM `gallery` style-3 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: gallery, mosaic, masonry, pictures, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-gallery style-3","metadata":{"name":"gallery.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-gallery style-3">
<!-- wp:group {"className":"gallery-mosaic jf-mb-2 jf-tb-2 jf-dt-4 jf-gutter-32","metadata":{"name":"gallery.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group gallery-mosaic jf-mb-2 jf-tb-2 jf-dt-4 jf-gutter-32">
<!-- wp:group {"className":"gallery-item item-2","metadata":{"name":"gallery.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group gallery-item item-2">
<!-- wp:image {"sizeSlug":"full","lightbox":{"enabled":true},"className":"gallery-img","metadata":{"role":"content","name":"gallery.img.1"}} -->
<figure class="wp-block-image size-full gallery-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
