<?php
/**
 * Title: Gallery strip
 * Slug: wp-ja-essence/section-gallery
 * Description: A row of pictures with a link button below (Joomla ACM gallery style-1).
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: gallery, instagram, acm
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"tagName":"section","className":"je-sec je-gallery","metadata":{"name":"gallery.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group je-sec je-gallery">
<!-- wp:group {"className":"je-container","layout":{"type":"default"}} -->
<div class="wp-block-group je-container">
<!-- wp:group {"className":"je-gallery__row","layout":{"type":"default"}} -->
<div class="wp-block-group je-gallery__row">
<!-- wp:group {"className":"je-gallery__item","metadata":{"name":"gallery.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group je-gallery__item">
<!-- wp:image {"sizeSlug":"large","className":"je-gallery__img","metadata":{"role":"content","name":"gallery.image.1"}} -->
<figure class="wp-block-image size-large je-gallery__img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"je-gallery__more","layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons je-gallery__more">
<!-- wp:button {"className":"je-btn-primary","metadata":{"name":"gallery.title"}} -->
<div class="wp-block-button je-btn-primary"><a class="wp-block-button__link wp-element-button" href="#">@Grazia on instagram</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
