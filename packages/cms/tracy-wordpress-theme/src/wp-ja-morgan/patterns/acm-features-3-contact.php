<?php
/**
 * Title: Picture and text with a quick contact form
 * Slug: wp-ja-morgan/acm-features-3-contact
 * Description: A picture on one half and a section title, a lead and a short contact form on the other (Joomla ACM `features-intro` style-3 with the JA Quick Contact module JA Morgan loads inside it).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, split, picture, text, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"features-intro.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"acm-features style-3","layout":{"type":"default"}} -->
<div class="wp-block-group acm-features style-3">
<!-- wp:image {"sizeSlug":"full","className":"features-image","metadata":{"role":"content","name":"features-intro.img-features"}} -->
<figure class="wp-block-image size-full features-image"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"features-content","layout":{"type":"default"}} -->
<div class="wp-block-group features-content">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"features-intro.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Introducing.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jm-module-title","metadata":{"role":"content","name":"features-intro.module-title"}} -->
<h3 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A section title', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"lead","metadata":{"role":"content","name":"features-intro.description"}} -->
<p class="lead"><?php esc_html_e( 'A lead of two or three lines.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"lead jm-lead-more","metadata":{"role":"content","name":"features-intro.description-more"}} -->
<p class="lead jm-lead-more"></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"list-check","metadata":{"role":"content","name":"features-intro.check-list"}} -->
<ul class="wp-block-list list-check"><!-- wp:list-item -->
<li><?php esc_html_e( 'A point', 'wp-ja-morgan' ); ?></li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"features-module-wrap acm-accordion","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-module-wrap acm-accordion">
<!-- wp:details {"className":"panel","metadata":{"name":"features-intro.item.1"}} -->
<details class="wp-block-details panel"><summary>Creativity &amp; Originality</summary><!-- wp:paragraph {"className":"panel-body","metadata":{"role":"content","name":"features-intro.accordion-desc.1"}} -->
<p class="panel-body"><?php esc_html_e( 'An answer of two or three lines.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:html {"metadata":{"role":"content","name":"features-intro.form"}} -->
<?php echo function_exists( 'wp_ja_morgan_quick_contact_form' ) ? wp_ja_morgan_quick_contact_form() : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built and escaped by wp_ja_morgan_quick_contact_form(). ?>
<!-- /wp:html -->
<!-- wp:buttons {"className":"features-action"} -->
<div class="wp-block-buttons features-action">
<!-- wp:button {"className":"btn btn-primary jm-arrow","metadata":{"role":"content","name":"features-intro.button"}} -->
<div class="wp-block-button btn btn-primary jm-arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Book a Consultation', 'wp-ja-morgan' ); ?></a></div>
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
