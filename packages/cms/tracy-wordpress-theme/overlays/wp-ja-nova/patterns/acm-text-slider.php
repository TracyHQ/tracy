<?php
/**
 * Title: Moving tag row
 * Slug: wp-ja-nova/section-text-slider
 * Description: A row of pill tags, each an icon and a word, that drifts across the band without end (Joomla ACM text-slider style-1). The direction follows the section's cta-1 (right to left) or cta-0 class.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: tags, marquee, slider, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-marquee","metadata":{"name":"text-slider.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-marquee">
<!-- wp:group {"className":"jn-marquee__track","metadata":{"name":"text-slider.track"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-marquee__track">
<!-- wp:group {"className":"jn-marquee__item","metadata":{"name":"text-slider.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-marquee__item">
<!-- wp:image {"sizeSlug":"full","className":"jn-marquee__icon","metadata":{"role":"content","name":"text-slider.logo.1"}} -->
<figure class="wp-block-image size-full jn-marquee__icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"jn-marquee__title","metadata":{"role":"content","name":"text-slider.title.1"}} -->
<h3 class="wp-block-heading jn-marquee__title"><?php esc_html_e( 'A tag', 'wp-ja-nova' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
