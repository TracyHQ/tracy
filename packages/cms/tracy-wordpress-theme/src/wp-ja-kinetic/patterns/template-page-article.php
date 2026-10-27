<?php
/**
 * Title: Template body: page-article
 * Slug: wp-ja-kinetic/template-page-article
 * Description: The body of templates/page-article.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"hx-article-page","layout":{"type":"default"}} -->
<main class="wp-block-group hx-article-page">
<!-- wp:group {"tagName":"article","className":"com-content-article item-page hx-article","layout":{"type":"default"}} -->
<article class="wp-block-group com-content-article item-page hx-article">
<!-- wp:group {"tagName":"header","className":"hx-article__head hx-grid-bg","layout":{"type":"default"}} -->
<header class="wp-block-group hx-article__head hx-grid-bg">
<!-- wp:group {"className":"hx-container hx-pad hx-article__head-inner","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad hx-article__head-inner">
<!-- wp:group {"tagName":"nav","className":"hx-article__breadcrumb"} -->
<nav class="wp-block-group hx-article__breadcrumb" aria-label="Breadcrumb">
<!-- wp:paragraph {"metadata":{"name":"article-breadcrumb.home"}} -->
<p><a class="hx-bc-home" href="/"><?php echo esc_html__( 'Home', 'wp-ja-kinetic' ); ?></a><span class="hx-bc-sep">/</span></p>
<!-- /wp:paragraph -->
<!-- wp:post-terms {"term":"category","className":"hx-bc-cat"} /-->
<!-- wp:paragraph {"metadata":{"name":"article-breadcrumb.sep"}} -->
<p><span class="hx-bc-sep">/</span></p>
<!-- /wp:paragraph -->
<!-- wp:post-title {"level":0,"className":"hx-bc-current"} /-->
</nav>
<!-- /wp:group -->
<!-- wp:post-terms {"term":"category","className":"hx-eyebrow hx-article__cat"} /-->
<!-- wp:post-title {"level":1,"className":"hx-h1 hx-article__title"} /-->
<!-- wp:post-excerpt {"className":"hx-article__sub","excerptLength":30} /-->
</div>
<!-- /wp:group -->
</header>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-section hx-article__bodywrap","layout":{"type":"default"}} -->
<div class="wp-block-group hx-section hx-article__bodywrap">
<!-- wp:group {"className":"hx-container hx-pad","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-prose","layout":{"type":"default"}} -->
<div class="wp-block-group hx-prose">
<!-- wp:group {"className":"hx-author","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group hx-author">
<!-- wp:wp-ja-kinetic/author-initials /-->
<!-- wp:group {"className":"hx-author__c","layout":{"type":"default"}} -->
<div class="wp-block-group hx-author__c">
<!-- wp:post-author-name {"className":"hx-author__name"} /-->
<!-- wp:wp-ja-kinetic/article-byline-meta /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:post-featured-image {"isLink":false,"className":"item-image"} /-->
<!-- wp:post-content {"className":"com-content-article__body article-body","layout":{"type":"default"}} /-->
<!-- wp:post-terms {"term":"post_tag","className":"tags"} /-->
<!-- wp:wp-ja-kinetic/article-foot /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:wp-ja-kinetic/related-posts /-->
<!-- wp:block {"metadata":{"name":"cta.article"}} /-->
</article>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
