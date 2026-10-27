<?php
/**
 * Title: Template body: author
 * Slug: wp-ja-kinetic/template-author
 * Description: The body of templates/author.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"hx-author","layout":{"type":"default"}} -->
<main class="wp-block-group hx-author">
<!-- wp:group {"tagName":"header","className":"hx-author__head hx-grid-bg","layout":{"type":"default"}} -->
<header class="wp-block-group hx-author__head hx-grid-bg">
<!-- wp:group {"className":"hx-container hx-author__head-inner","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-author__head-inner">
<!-- wp:group {"tagName":"nav","className":"hx-author__bc"} -->
<nav class="wp-block-group hx-author__bc" aria-label="Breadcrumb">
<!-- wp:paragraph -->
<p><a class="hx-author__bc-home" href="/"><?php echo esc_html__( 'Home', 'wp-ja-kinetic' ); ?></a><span class="hx-author__bc-trail">/ <a class="hx-author__bc-link" href="/product/authors"><?php echo esc_html__( 'Authors', 'wp-ja-kinetic' ); ?></a> / </span></p>
<!-- /wp:paragraph -->
<!-- wp:post-author-name /-->
</nav>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-au-pill"} -->
<p class="hx-au-pill"><span class="hx-au-pill__dot"></span><span class="hx-au-pill__t"><?php echo esc_html__( 'Author', 'wp-ja-kinetic' ); ?></span></p>
<!-- /wp:paragraph -->
<!-- wp:query-title {"type":"archive","level":1,"className":"hx-author__title","showPrefix":false} /-->
<!-- wp:post-author-biography {"className":"hx-author__sub"} /-->
</div>
<!-- /wp:group -->
</header>
<!-- /wp:group -->
<!-- wp:group {"tagName":"section","className":"hx-author__body","layout":{"type":"default"}} -->
<section class="wp-block-group hx-author__body">
<!-- wp:group {"className":"hx-container hx-author__inner","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-author__inner">
<!-- wp:wp-ja-kinetic/author-identity /-->
<!-- wp:query {"queryId":1,"query":{"perPage":4,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"hx-auposts","layout":{"type":"default"}} -->
<div class="wp-block-query hx-auposts">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:group {"className":"hx-aupost","layout":{"type":"default"}} -->
<div class="wp-block-group hx-aupost">
<!-- wp:wp-ja-kinetic/post-topic-eyebrow {"className":"hx-aupost__tag","categoryOnly":true} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"hx-aupost__t"} /-->
<!-- wp:post-excerpt {"className":"hx-aupost__e"} /-->
<!-- wp:wp-ja-kinetic/post-readtime {"wrapperClassName":"hx-aupost__m","dateFormat":"M j"} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"hx-auposts__empty"} -->
<p class="hx-auposts__empty"><?php echo esc_html__( 'No articles yet.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
