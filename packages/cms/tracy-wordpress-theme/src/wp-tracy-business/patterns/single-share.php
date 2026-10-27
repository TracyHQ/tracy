<?php
/**
 * Title: Article share links
 * Slug: wp-tracy-business/single-share
 * Description: The share links of the article head (templates/single.html). Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:html -->
<div class="tracy-article__share" data-tracy-share><a class="tracy-article__share-link" href="https://www.linkedin.com/sharing/share-offsite/?url=" data-share="linkedin" target="_blank" rel="noopener" aria-label="<?php echo esc_attr__( 'Share on LinkedIn', 'wp-tracy-business' ); ?>">in</a><a class="tracy-article__share-link" href="https://www.facebook.com/sharer/sharer.php?u=" data-share="facebook" target="_blank" rel="noopener" aria-label="<?php echo esc_attr__( 'Share on Facebook', 'wp-tracy-business' ); ?>">f</a><button type="button" class="tracy-article__share-link" data-share="copy" aria-label="<?php echo esc_attr__( 'Copy link', 'wp-tracy-business' ); ?>">&#x2398;</button></div>
<script>(function(){var page=location.href.split('#')[0];document.querySelectorAll('[data-tracy-share]').forEach(function(group){group.querySelectorAll('a[data-share]').forEach(function(a){a.href+=encodeURIComponent(page)});var copy=group.querySelector('[data-share="copy"]');if(!copy||!navigator.clipboard){if(copy)copy.hidden=true;return}copy.addEventListener('click',function(){navigator.clipboard.writeText(page).then(function(){copy.classList.add('is-done');setTimeout(function(){copy.classList.remove('is-done')},1500)})})})})();</script>
<!-- /wp:html -->
