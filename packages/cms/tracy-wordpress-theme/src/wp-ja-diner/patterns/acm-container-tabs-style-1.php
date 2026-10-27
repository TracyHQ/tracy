<?php
/**
 * Title: Container tabs
 * Slug: wp-ja-diner/acm-container-tabs-style-1
 * Description: A picture, a heading and a row of tabs that switch between the menu sections placed right after it (Joomla ACM container-tabs style-1 of JA Diner).
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: tabs, menu, acm
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:group {"className":"t3-section module padding-top","metadata":{"name":"container-tabs.root"}} -->
<div class="wp-block-group t3-section module padding-top">
<!-- wp:group {"className":"container"} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"module-inner"} -->
<div class="wp-block-group module-inner">
<!-- wp:group {"className":"module-ct"} -->
<div class="wp-block-group module-ct">
<!-- wp:group {"className":"acm-container-tabs"} -->
<div class="wp-block-group acm-container-tabs">
<!-- wp:group {"className":"row"} -->
<div class="wp-block-group row">
<!-- wp:group {"className":"hidden-xs hidden-sm col-md-5"} -->
<div class="wp-block-group hidden-xs hidden-sm col-md-5">
<!-- wp:group {"className":"tabs-image-intro"} -->
<div class="wp-block-group tabs-image-intro">
<!-- wp:image {"sizeSlug":"full","className":"jd-img","metadata":{"role":"content","name":"container-tabs.image-intro"}} -->
<figure class="wp-block-image size-full jd-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"col-md-7"} -->
<div class="wp-block-group col-md-7">
<!-- wp:group {"className":"section-title-wrap"} -->
<div class="wp-block-group section-title-wrap">
<!-- wp:heading {"level":5,"className":"section-title","metadata":{"role":"content","name":"container-tabs.module-title"}} -->
<h5 class="wp-block-heading section-title"><?php esc_html_e( 'Discover Our Menu.', 'wp-ja-diner' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"section-sub h2","metadata":{"role":"content","name":"container-tabs.sub-heading"}} -->
<p class="section-sub h2"><?php esc_html_e( 'A sentence about the menu.', 'wp-ja-diner' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"container-tabs-nav","metadata":{"name":"container-tabs.nav-wrap"}} -->
<div class="wp-block-group container-tabs-nav">
<!-- wp:html {"metadata":{"name":"container-tabs.nav"}} -->
<ul class="nav nav-tabs jd-tabs-nav" role="tablist"></ul>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
<!-- wp:html {"metadata":{"name":"container-tabs.panels"}} -->
<div class="tab-content jd-tabs-panels"></div>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
