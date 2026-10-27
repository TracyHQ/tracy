<?php
/**
 * Title: Project tabs
 * Slug: wp-ja-nova/section-project-tabs
 * Description: A section title over tabs, one Query Loop per child category of Project (All project, Branding, UI/UX design, Illustration), the source's Articles - Categories module in its tabs layout. The theme's script switches the tabs and pages each list four cards at a time.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: project, tabs, portfolio
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-ptabs top-large bottom-large","metadata":{"name":"articles-categories.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-ptabs top-large bottom-large">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"articles-categories.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'We have an experienced team of production', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"jn-ptabs__nav"} -->
<div class="wp-block-buttons jn-ptabs__nav">
<!-- wp:button {"className":"jn-ptabs__tab"} -->
<div class="wp-block-button jn-ptabs__tab"><a class="wp-block-button__link wp-element-button" href="#jn-ptab-project"><?php esc_html_e( 'All project', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"jn-ptabs__tab"} -->
<div class="wp-block-button jn-ptabs__tab"><a class="wp-block-button__link wp-element-button" href="#jn-ptab-branding"><?php esc_html_e( 'Branding', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"jn-ptabs__tab"} -->
<div class="wp-block-button jn-ptabs__tab"><a class="wp-block-button__link wp-element-button" href="#jn-ptab-ui-ux-design"><?php esc_html_e( 'UI/UX design', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"jn-ptabs__tab"} -->
<div class="wp-block-button jn-ptabs__tab"><a class="wp-block-button__link wp-element-button" href="#jn-ptab-illustration"><?php esc_html_e( 'Illustration', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:group {"className":"jn-ptabs__panel","anchor":"jn-ptab-project","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__panel" id="jn-ptab-project">
<!-- wp:query {"queryId":91,"query":{"perPage":100,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaNovaCategory":"project","wpJaNovaSourceOrder":true},"className":"jn-ptabs__list"} -->
<div class="wp-block-query jn-ptabs__list">
<!-- wp:post-template {"className":"jn-ptabs__items"} -->
<!-- wp:group {"className":"jn-ptabs__card","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__card">
<!-- wp:post-featured-image {"isLink":false,"className":"jn-ptabs__image"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"jn-ptabs__title"} /-->
<!-- wp:post-excerpt {"excerptLength":100,"className":"jn-ptabs__excerpt","moreText":""} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-ptabs__panel","anchor":"jn-ptab-branding","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__panel" id="jn-ptab-branding">
<!-- wp:query {"queryId":92,"query":{"perPage":100,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaNovaCategory":"branding","wpJaNovaSourceOrder":true},"className":"jn-ptabs__list"} -->
<div class="wp-block-query jn-ptabs__list">
<!-- wp:post-template {"className":"jn-ptabs__items"} -->
<!-- wp:group {"className":"jn-ptabs__card","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__card">
<!-- wp:post-featured-image {"isLink":false,"className":"jn-ptabs__image"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"jn-ptabs__title"} /-->
<!-- wp:post-excerpt {"excerptLength":100,"className":"jn-ptabs__excerpt","moreText":""} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-ptabs__panel","anchor":"jn-ptab-ui-ux-design","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__panel" id="jn-ptab-ui-ux-design">
<!-- wp:query {"queryId":93,"query":{"perPage":100,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaNovaCategory":"ui-ux-design","wpJaNovaSourceOrder":true},"className":"jn-ptabs__list"} -->
<div class="wp-block-query jn-ptabs__list">
<!-- wp:post-template {"className":"jn-ptabs__items"} -->
<!-- wp:group {"className":"jn-ptabs__card","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__card">
<!-- wp:post-featured-image {"isLink":false,"className":"jn-ptabs__image"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"jn-ptabs__title"} /-->
<!-- wp:post-excerpt {"excerptLength":100,"className":"jn-ptabs__excerpt","moreText":""} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-ptabs__panel","anchor":"jn-ptab-illustration","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__panel" id="jn-ptab-illustration">
<!-- wp:query {"queryId":94,"query":{"perPage":100,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaNovaCategory":"illustration","wpJaNovaSourceOrder":true},"className":"jn-ptabs__list"} -->
<div class="wp-block-query jn-ptabs__list">
<!-- wp:post-template {"className":"jn-ptabs__items"} -->
<!-- wp:group {"className":"jn-ptabs__card","layout":{"type":"default"}} -->
<div class="wp-block-group jn-ptabs__card">
<!-- wp:post-featured-image {"isLink":false,"className":"jn-ptabs__image"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"jn-ptabs__title"} /-->
<!-- wp:post-excerpt {"excerptLength":100,"className":"jn-ptabs__excerpt","moreText":""} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
