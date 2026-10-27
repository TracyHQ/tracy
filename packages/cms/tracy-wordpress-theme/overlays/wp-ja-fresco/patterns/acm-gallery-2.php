<?php
/**
 * Title: Picture grid with a title
 * Slug: wp-ja-fresco/acm-gallery-2
 * Description: A section title over a grid of square pictures in two to four columns, each opening larger on click (Joomla ACM `gallery` style-2 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: gallery, grid, pictures, photos, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-gallery style-2","metadata":{"name":"gallery.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-gallery style-2">
<!-- wp:group {"className":"jf-container section-title-wrap","metadata":{"name":"gallery.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group jf-container section-title-wrap">
<!-- wp:heading {"className":"main-title","metadata":{"role":"content","name":"gallery.main-section"}} -->
<h2 class="wp-block-heading main-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"gallery-grid acm-gallery--cols-3","metadata":{"name":"gallery.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group gallery-grid acm-gallery--cols-3">
<!-- wp:group {"className":"gallery-item","metadata":{"name":"gallery.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group gallery-item">
<!-- wp:image {"sizeSlug":"full","lightbox":{"enabled":true},"className":"gallery-img","metadata":{"role":"content","name":"gallery.gallery-image.1"}} -->
<figure class="wp-block-image size-full gallery-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
