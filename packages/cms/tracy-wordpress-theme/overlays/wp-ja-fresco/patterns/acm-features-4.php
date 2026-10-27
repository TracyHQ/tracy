<?php
/**
 * Title: Text beside a picture
 * Slug: wp-ja-fresco/acm-features-4
 * Description: A title, a paragraph with a ticked list and an outline button on one side, a picture on the other; the text side is set per section (Joomla ACM `features-intro` style-4 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: feature, about, picture, list, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-features style-4","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-features style-4">
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"features-row align-left","metadata":{"name":"features-intro.row"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-row align-left">
<!-- wp:group {"className":"box-content","layout":{"type":"default"}} -->
<div class="wp-block-group box-content">
<!-- wp:heading {"className":"features-title","metadata":{"role":"content","name":"features-intro.title"}} -->
<h2 class="wp-block-heading features-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"desc","metadata":{"name":"features-intro.desc-wrap"},"layout":{"type":"default"}} -->
<div class="wp-block-group desc">
<!-- wp:paragraph {"className":"features-desc","metadata":{"role":"content","name":"features-intro.desc"}} -->
<p class="features-desc"><?php esc_html_e( 'A paragraph of three or four lines.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"features-desc","metadata":{"role":"content","name":"features-intro.tab-body"}} -->
<p class="features-desc"><?php esc_html_e( 'A paragraph followed by a list.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"link-btn"} -->
<div class="wp-block-buttons link-btn">
<!-- wp:button {"className":"btn btn-outline-primary","metadata":{"role":"content","name":"features-intro.button"}} -->
<div class="wp-block-button btn btn-outline-primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Join now', 'wp-ja-fresco' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:image {"sizeSlug":"full","className":"features-img","metadata":{"role":"content","name":"features-intro.img"}} -->
<figure class="wp-block-image size-full features-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
