<?php
/**
 * Title: Masthead
 * Slug: wp-ja-restaurant/acm-masthead-default
 * Description: The page banner under the menu band: a picture, a large title and a one-line description (Joomla module mod_jamasthead of JA Restaurant).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: masthead, banner, page title, hero
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"wrap t3-masthead","metadata":{"name":"masthead.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group wrap t3-masthead">
<!-- wp:group {"className":"ja-masthead has-bg","layout":{"type":"default"}} -->
<div class="wp-block-group ja-masthead has-bg">
<!-- wp:image {"sizeSlug":"full","className":"jr-masthead-bg","metadata":{"role":"content","name":"masthead.background"}} -->
<figure class="wp-block-image size-full jr-masthead-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"ja-masthead-detail","layout":{"type":"default"}} -->
<div class="wp-block-group ja-masthead-detail">
<!-- wp:heading {"level":1,"className":"ja-masthead-title","metadata":{"role":"content","name":"masthead.title"}} -->
<h1 class="wp-block-heading ja-masthead-title"><?php esc_html_e( 'Page title', 'wp-ja-restaurant' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"ja-masthead-description","metadata":{"role":"content","name":"masthead.description"}} -->
<p class="ja-masthead-description"><?php esc_html_e( 'A one-line description of the page.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
