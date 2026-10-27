<?php
/**
 * Title: Picture and text, half and half
 * Slug: wp-ja-fresco/acm-features-3
 * Description: A picture filling one half of the row and, on the other half, an eyebrow, a large title, a few lines and an outline button; the picture side and the text alignment are set per section (Joomla ACM `features-intro` style-3 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: feature, picture, intro, split, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-features style-3","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-features style-3">
<!-- wp:group {"className":"features-row media-right","metadata":{"name":"features-intro.row"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-row media-right">
<!-- wp:image {"sizeSlug":"full","className":"intro-img","metadata":{"role":"content","name":"features-intro.intro-img"}} -->
<figure class="wp-block-image size-full intro-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"features-desc content-left","metadata":{"name":"features-intro.desc"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-desc content-left">
<!-- wp:group {"className":"info-wrap","layout":{"type":"default"}} -->
<div class="wp-block-group info-wrap">
<!-- wp:paragraph {"className":"sub-title","metadata":{"role":"content","name":"features-intro.sub-title"}} -->
<p class="sub-title"><?php esc_html_e( 'Eyebrow', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"info-title","metadata":{"role":"content","name":"features-intro.info-title"}} -->
<h2 class="wp-block-heading info-title"><?php esc_html_e( 'A large title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"info-desc","metadata":{"role":"content","name":"features-intro.info-desc"}} -->
<p class="info-desc"><?php esc_html_e( 'Two or three lines about it.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"info-desc","metadata":{"role":"content","name":"features-intro.tab-body"}} -->
<p class="info-desc"><?php esc_html_e( 'Longer text with its own headings.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"acm-action"} -->
<div class="wp-block-buttons acm-action">
<!-- wp:button {"className":"btn btn-outline-light","metadata":{"role":"content","name":"features-intro.button"}} -->
<div class="wp-block-button btn btn-outline-light"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Book your table', 'wp-ja-fresco' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
