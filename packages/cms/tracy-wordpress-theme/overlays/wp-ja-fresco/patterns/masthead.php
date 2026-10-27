<?php
/**
 * Title: Page masthead
 * Slug: wp-ja-fresco/masthead
 * Description: The band at the top of an inner page: its featured picture behind the page title and excerpt (the source's mod_jamasthead, drawn by the masthead page template).
 * Categories: wp-ja-fresco, tracy
 * Viewport Width: 1440
 * Inserter: no
 * Keywords: masthead, page title, banner
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:cover {"useFeaturedImage":true,"dimRatio":0,"isUserOverlayColor":true,"minHeight":296,"className":"ja-masthead","metadata":{"name":"page.masthead"},"layout":{"type":"default"}} -->
<div class="wp-block-cover ja-masthead" style="min-height:296px"><span aria-hidden="true" class="wp-block-cover__background has-background-dim-0 has-background-dim"></span><div class="wp-block-cover__inner-container">
<!-- wp:group {"className":"ja-masthead-detail","layout":{"type":"default"}} -->
<div class="wp-block-group ja-masthead-detail">
<!-- wp:post-title {"level":1,"className":"ja-masthead-title","metadata":{"name":"page.title"}} --><!-- /wp:post-title -->
<!-- wp:post-excerpt {"className":"ja-masthead-description","metadata":{"name":"page.description"}} --><!-- /wp:post-excerpt -->
</div>
<!-- /wp:group -->
</div></div>
<!-- /wp:cover -->
