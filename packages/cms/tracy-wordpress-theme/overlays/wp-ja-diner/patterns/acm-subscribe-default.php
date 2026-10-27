<?php
/**
 * Title: Subscribe
 * Slug: wp-ja-diner/acm-subscribe-default
 * Description: A dark band with a pattern background, a sub-heading, an e-mail field and a button (Joomla ACM subscribe of JA Diner). The form delivers nothing (content gap G1).
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: subscribe, newsletter, acm
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:group {"className":"t3-section module acy-mailing padding-top padding-bottom","metadata":{"name":"subscribe.root"}} -->
<div class="wp-block-group t3-section module acy-mailing padding-top padding-bottom">
<!-- wp:image {"sizeSlug":"full","className":"jd-section-bg","metadata":{"role":"content","name":"subscribe.section-bg"}} -->
<figure class="wp-block-image size-full jd-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container"} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"module-inner"} -->
<div class="wp-block-group module-inner">
<!-- wp:heading {"level":5,"className":"section-title","metadata":{"role":"content","name":"subscribe.module-title"}} -->
<h5 class="wp-block-heading section-title"><?php esc_html_e( 'Subscribe', 'wp-ja-diner' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"section-sub h2","metadata":{"role":"content","name":"subscribe.sub-heading"}} -->
<p class="section-sub h2"><?php esc_html_e( 'A sentence inviting visitors to subscribe.', 'wp-ja-diner' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"module-ct"} -->
<div class="wp-block-group module-ct">
<!-- wp:group {"className":"acym_fulldiv"} -->
<div class="wp-block-group acym_fulldiv">
<!-- wp:group {"className":"acym_module_form"} -->
<div class="wp-block-group acym_module_form">
<!-- wp:html {"metadata":{"name":"subscribe.form"}} -->
<form class="jd-subscribe-form" method="post" action="" aria-label="<?php echo esc_attr__( 'Subscribe', 'wp-ja-diner' ); ?>"><table class="acym_form"><tr><td class="onefield acyfield_2 acyfield_text"><input name="email" type="email" required placeholder="<?php echo esc_attr__( 'Email', 'wp-ja-diner' ); ?>" aria-label="<?php echo esc_attr__( 'Email', 'wp-ja-diner' ); ?>" class="cell"/></td><td class="acysubbuttons"><input type="submit" class="btn btn-primary button subbutton" value="<?php echo esc_attr__( 'Subscribe', 'wp-ja-diner' ); ?>"/></td></tr></table></form>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"acym_posttext","metadata":{"role":"content","name":"subscribe.posttext"}} -->
<p class="acym_posttext"><?php esc_html_e( 'A line under the form.', 'wp-ja-diner' ); ?></p>
<!-- /wp:paragraph -->
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
