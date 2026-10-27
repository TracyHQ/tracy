<?php
/**
 * Title: Tabs: menu tabs
 * Slug: wp-ja-restaurant/acm-tabs-style-1
 * Description: A heading over a row of tabs that switch between the menu sections placed right after it (Joomla ACM `tabs` style-1 of JA Restaurant). The tab buttons are built from each following section tab title.
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: tabs, menu, acm
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"tagName":"section","className":"t3-section-module","metadata":{"name":"tabs.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group t3-section-module">
<!-- wp:image {"sizeSlug":"full","className":"jr-section-bg","metadata":{"role":"content","name":"tabs.section-bg"}} -->
<figure class="wp-block-image size-full jr-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:group {"className":"t3-section-ct","metadata":{"name":"tabs.content"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"acm-container-tabs","metadata":{"name":"tabs.box"},"layout":{"type":"default"}} -->
<div class="wp-block-group acm-container-tabs">
<!-- wp:group {"className":"container","metadata":{"name":"tabs.inner"},"layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:heading {"level":1,"className":"tabs-heading","metadata":{"role":"content","name":"tabs.heading"}} -->
<h1 class="wp-block-heading tabs-heading"><?php esc_html_e( 'Discover Our Menu', 'wp-ja-restaurant' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:group {"className":"container-tabs-nav","metadata":{"name":"tabs.nav-wrap"},"layout":{"type":"default"}} -->
<div class="wp-block-group container-tabs-nav">
<!-- wp:html {"metadata":{"name":"tabs.nav"}} -->
<ul class="nav nav-tabs jr-tabs-nav" role="tablist"></ul>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
<!-- wp:html {"metadata":{"name":"tabs.panels"}} -->
<div class="tab-content jr-tabs-panels"></div>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
