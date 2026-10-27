<?php
/**
 * Title: Page masthead
 * Slug: wp-ja-kinetic/section-page-masthead
 * Description: Inner-page header over the faint line-grid band: mono eyebrow, display heading and an intro, centered and closed by a hairline rule. Every spec section of type `page-masthead`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: masthead, page header, title, eyebrow, kinetic
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"className":"ja-acm acm-page-masthead style-1 is-center","metadata":{"name":"page-masthead"}} -->
<div class="wp-block-group ja-acm acm-page-masthead style-1 is-center">
<!-- wp:group {"className":"hx-section hx-grid-bg"} -->
<div class="wp-block-group hx-section hx-grid-bg">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-mast-head"} -->
<div class="wp-block-group hx-mast-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"page-masthead.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '// pricing', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"hx-h1","metadata":{"role":"content","name":"page-masthead.title"}} -->
<h1 class="wp-block-heading hx-h1"><?php esc_html_e( 'Simple, usage-based pricing', 'wp-ja-kinetic' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-mast-sub","metadata":{"role":"content","name":"page-masthead.sub"}} -->
<p class="hx-mast-sub"><?php esc_html_e( 'Start free. Scale when you need to. Pay for what you query, never for seats you forgot about.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
