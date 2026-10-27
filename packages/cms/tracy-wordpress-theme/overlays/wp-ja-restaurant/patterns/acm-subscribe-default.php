<?php
/**
 * Title: Subscribe
 * Slug: wp-ja-restaurant/acm-subscribe-default
 * Description: A centred newsletter box on a fixed background: a title, a short text, an e-mail field and a button (Joomla ACM subscribe of JA Restaurant, an AcyMailing form on the source).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: subscribe, newsletter, email, form, acm
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module","metadata":{"name":"subscribe.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module">
<!-- wp:image {"sizeSlug":"full","className":"jr-section-bg","metadata":{"role":"content","name":"subscribe.section-bg"}} -->
<figure class="wp-block-image size-full jr-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"t3-section-inner","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-inner">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:heading {"className":"t3-section-title","metadata":{"role":"content","name":"subscribe.module-title"}} -->
<h2 class="wp-block-heading t3-section-title"><?php esc_html_e( 'Subscribe', 'wp-ja-restaurant' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"t3-section-ct","layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-ct">
<!-- wp:group {"className":"acym_module","layout":{"type":"default"}} -->
<div class="wp-block-group acym_module">
<!-- wp:group {"className":"acym_fulldiv","layout":{"type":"default"}} -->
<div class="wp-block-group acym_fulldiv">
<!-- wp:group {"className":"acym_module_form","layout":{"type":"default"}} -->
<div class="wp-block-group acym_module_form">
<!-- wp:paragraph {"className":"acym_introtext","metadata":{"role":"content","name":"subscribe.introtext"}} -->
<p class="acym_introtext"><?php esc_html_e( 'One short e-mail a month with news and offers.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:html {"metadata":{"name":"subscribe.form"}} -->
<form class="jr-subscribe-form" method="post" action="" aria-label="<?php echo esc_attr__( 'Subscribe', 'wp-ja-restaurant' ); ?>"><table class="acym_form"><tr><td class="onefield acyfield_text"><input name="email" type="email" required placeholder="<?php echo esc_attr__( 'Email', 'wp-ja-restaurant' ); ?>" aria-label="<?php echo esc_attr__( 'Email', 'wp-ja-restaurant' ); ?>" class="cell"/></td><td class="acysubbuttons"><button type="submit" class="btn btn-primary button subbutton"><?php esc_html_e( 'Subscribe', 'wp-ja-restaurant' ); ?></button></td></tr></table></form>
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
